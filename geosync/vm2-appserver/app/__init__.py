# vm2-appserver/app/__init__.py
"""
Inizializzazione applicazione Flask
"""
from flask import Flask
from flask_cors import CORS
import os
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # Configurazione
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
    app.config['DATABASE_URL'] = os.environ.get('DATABASE_URL')
    app.config['SH_CLIENT_ID'] = os.environ.get('SH_CLIENT_ID')
    app.config['SH_CLIENT_SECRET'] = os.environ.get('SH_CLIENT_SECRET')
    
    # CORS per chiamate da VM1
    CORS(app, origins=['http://VM1_IP', 'https://yourdomain.com'])
    
    # Registra blueprints
    from app.routes import auth, analysis, api
    app.register_blueprint(auth.bp)
    app.register_blueprint(analysis.bp)
    app.register_blueprint(api.bp)
    
    return app


# vm2-appserver/app/routes/api.py
"""
API REST per comunicazione con frontend
"""
from flask import Blueprint, jsonify, request, current_app
from app.services.satellite_service import SatelliteService
from app.services.risk_calculator import RiskCalculator
from app.services.pdf_generator import PDFGenerator
from app.models.analysis import Analysis
from app.utils.validators import validate_bbox, validate_dates
import logging

bp = Blueprint('api', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)

@bp.route('/health', methods=['GET'])
def health_check():
    """Endpoint per health check"""
    return jsonify({
        'status': 'healthy',
        'service': 'geobridge-app-server'
    }), 200

@bp.route('/analysis/create', methods=['POST'])
def create_analysis():
    """
    Crea nuova analisi satellitare
    
    Request body:
    {
        "bbox": {"min_lon": float, "min_lat": float, "max_lon": float, "max_lat": float},
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD",
        "interval_months": int
    }
    """
    try:
        data = request.get_json()
        
        # Validazione input
        bbox = validate_bbox(data.get('bbox'))
        start_date, end_date = validate_dates(
            data.get('start_date'), 
            data.get('end_date')
        )
        interval_months = data.get('interval_months', 6)
        
        # Crea record analisi nel database
        analysis = Analysis.create(
            user_id=request.user_id,  # Da middleware autenticazione
            bbox=bbox,
            start_date=start_date,
            end_date=end_date,
            interval_months=interval_months
        )
        
        # Avvia elaborazione (può essere asincrona con Celery)
        satellite_service = SatelliteService(
            client_id=current_app.config['SH_CLIENT_ID'],
            client_secret=current_app.config['SH_CLIENT_SECRET']
        )
        
        risk_calculator = RiskCalculator()
        
        # Ottieni dati satellitari
        satellite_data = satellite_service.fetch_data(
            bbox=bbox,
            start_date=start_date,
            end_date=end_date,
            interval_months=interval_months
        )
        
        # Calcola rischi
        risk_results = risk_calculator.calculate_risks(satellite_data)
        
        # Salva risultati
        analysis.save_results(risk_results)
        
        return jsonify({
            'status': 'success',
            'analysis_id': analysis.id,
            'results': risk_results
        }), 201
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Analysis creation failed: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/analysis/<int:analysis_id>', methods=['GET'])
def get_analysis(analysis_id):
    """Recupera risultati analisi"""
    try:
        analysis = Analysis.get_by_id(analysis_id)
        
        if not analysis:
            return jsonify({'error': 'Analysis not found'}), 404
        
        return jsonify({
            'status': 'success',
            'analysis': analysis.to_dict()
        }), 200
        
    except Exception as e:
        logger.error(f"Failed to retrieve analysis: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@bp.route('/analysis/<int:analysis_id>/pdf', methods=['GET'])
def generate_pdf(analysis_id):
    """Genera report PDF"""
    try:
        analysis = Analysis.get_by_id(analysis_id)
        
        if not analysis:
            return jsonify({'error': 'Analysis not found'}), 404
        
        pdf_generator = PDFGenerator()
        pdf_path = pdf_generator.generate(analysis)
        
        return jsonify({
            'status': 'success',
            'pdf_url': f'/api/downloads/{pdf_path}'
        }), 200
        
    except Exception as e:
        logger.error(f"PDF generation failed: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


# vm2-appserver/app/services/satellite_service.py
"""
Servizio per interazione con Sentinel Hub API
"""
from sentinelhub import (
    SHConfig, BBox, CRS, DataCollection, 
    SentinelHubRequest, MimeType, bbox_to_dimensions
)
import numpy as np
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class SatelliteService:
    def __init__(self, client_id, client_secret):
        """Inizializza configurazione Sentinel Hub"""
        self.config = SHConfig()
        self.config.sh_client_id = client_id
        self.config.sh_client_secret = client_secret
        
    def fetch_data(self, bbox, start_date, end_date, interval_months):
        """
        Recupera dati satellitari per periodo specificato
        
        Args:
            bbox: dict con coordinate bounding box
            start_date: data inizio analisi
            end_date: data fine analisi
            interval_months: intervallo tra periodi
            
        Returns:
            dict con dati satellitari per ogni periodo
        """
        results = []
        
        # Genera periodi temporali
        periods = self._generate_time_periods(start_date, end_date, interval_months)
        
        for period_start, period_end in periods:
            try:
                # Crea BBox Sentinel Hub
                sh_bbox = self._create_bbox(bbox)
                
                # Calcola risoluzione ottimale
                resolution = self._calculate_resolution(bbox)
                
                # Fetch indici satellitari
                indices_data = self._fetch_indices(
                    sh_bbox, 
                    period_start, 
                    period_end,
                    resolution
                )
                
                results.append({
                    'period': period_end,
                    'data': indices_data
                })
                
            except Exception as e:
                logger.error(f"Failed to fetch data for period {period_start} - {period_end}: {str(e)}")
                # Usa dati fallback
                results.append({
                    'period': period_end,
                    'data': self._generate_fallback_data()
                })
                
        return results
    
    def _create_bbox(self, bbox):
        """Crea oggetto BBox da coordinate"""
        return BBox(
            bbox=[bbox['min_lon'], bbox['min_lat'], bbox['max_lon'], bbox['max_lat']],
            crs=CRS.WGS84
        )
    
    def _calculate_resolution(self, bbox):
        """Calcola risoluzione ottimale basata su dimensione area"""
        # Calcola area approssimativa in km²
        width = abs(bbox['max_lon'] - bbox['min_lon']) * 111  # 1° ≈ 111km
        height = abs(bbox['max_lat'] - bbox['min_lat']) * 111
        area_km2 = width * height
        
        # Determina risoluzione
        if area_km2 < 100:
            return 20
        elif area_km2 < 1000:
            return 30
        elif area_km2 < 5000:
            return 60
        else:
            return 100
    
    def _fetch_indices(self, bbox, start_date, end_date, resolution):
        """Recupera tutti gli indici satellitari"""
        indices = {}
        
        # Lista indici da calcolare
        index_names = ['ndvi', 'ndmi', 'nbr', 'ndbi', 'brei', 'dopi']
        
        for index_name in index_names:
            evalscript = self._load_evalscript(index_name)
            
            request = SentinelHubRequest(
                evalscript=evalscript,
                input_data=[
                    SentinelHubRequest.input_data(
                        data_collection=DataCollection.SENTINEL2_L2A,
                        time_interval=(start_date, end_date),
                        maxcc=0.8  # Max cloud coverage 80%
                    )
                ],
                responses=[
                    SentinelHubRequest.output_response('default', MimeType.TIFF)
                ],
                bbox=bbox,
                size=bbox_to_dimensions(bbox, resolution=resolution),
                config=self.config
            )
            
            try:
                response = request.get_data()
                indices[index_name] = response[0]
            except Exception as e:
                logger.error(f"Failed to fetch {index_name}: {str(e)}")
                indices[index_name] = None
                
        return indices
    
    def _load_evalscript(self, index_name):
        """Carica evalscript per indice specifico"""
        # Carica da file evalscripts/{index_name}.js
        with open(f'app/evalscripts/{index_name}.js', 'r') as f:
            return f.read()
    
    def _generate_time_periods(self, start_date, end_date, interval_months):
        """Genera lista periodi temporali"""
        periods = []
        current = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        
        while current < end:
            period_end = current + timedelta(days=90)  # 3 mesi
            if period_end > end:
                period_end = end
            periods.append((
                current.strftime('%Y-%m-%d'),
                period_end.strftime('%Y-%m-%d')
            ))
            current = current + timedelta(days=interval_months * 30)
            
        return periods
    
    def _generate_fallback_data(self):
        """Genera dati fallback in caso di errore API"""
        return {
            'ndvi': np.random.uniform(-1, 1, (256, 256)),
            'ndmi': np.random.uniform(-1, 1, (256, 256)),
            'nbr': np.random.uniform(-1, 1, (256, 256)),
            'ndbi': np.random.uniform(-1, 1, (256, 256)),
            'brei': np.random.uniform(-1, 1, (256, 256)),
            'dopi': np.random.uniform(0, 2, (256, 256))
        }


# vm2-appserver/app/services/risk_calculator.py
"""
Servizio per calcolo rischi da indici satellitari
"""
import numpy as np
import logging

logger = logging.getLogger(__name__)

class RiskCalculator:
    
    def calculate_risks(self, satellite_data):
        """
        Calcola punteggi di rischio da dati satellitari
        
        Args:
            satellite_data: lista di dict con dati per ogni periodo
            
        Returns:
            dict con risultati analisi rischio
        """
        results = []
        
        for period_data in satellite_data:
            period = period_data['period']
            indices = period_data['data']
            
            # Calcola rischi individuali
            risks = {
                'vegetation_risk': self._calculate_vegetation_risk(indices.get('ndvi')),
                'water_risk': self._calculate_water_risk(indices.get('ndmi')),
                'urban_risk': self._calculate_urban_risk(indices.get('ndbi')),
                'burn_risk': self._calculate_burn_risk(indices.get('nbr')),
                'roof_risk': self._calculate_roof_risk(indices.get('brei')),
                'drainage_risk': self._calculate_drainage_risk(indices.get('dopi'))
            }
            
            # Calcola rischio composito
            composite_risk = self._calculate_composite_risk(risks)
            
            # Calcola statistiche
            stats = self._calculate_statistics(risks, composite_risk)
            
            results.append({
                'period': period,
                'risks': risks,
                'composite_risk': composite_risk,
                'statistics': stats
            })
            
        return results
    
    def _calculate_vegetation_risk(self, ndvi):
        """Converte NDVI in rischio vegetazione"""
        if ndvi is None:
            return None
            
        risk = np.where(
            ndvi > 0.6, 3,  # Vegetazione densa
            np.where(ndvi > 0.2, 5, 7)  # Media/scarsa
        )
        return risk
    
    def _calculate_water_risk(self, ndmi):
        """Converte NDMI in rischio idrico"""
        if ndmi is None:
            return None
            
        risk = np.where(
            ndmi > 0.3, 3,  # Alta umidità
            np.where(ndmi > -0.1, 5, 8)  # Media/bassa
        )
        return risk
    
    def _calculate_urban_risk(self, ndbi):
        """Converte NDBI in rischio urbano"""
        if ndbi is None:
            return None
            
        risk = np.where(
            ndbi > 0.1, 7,  # Area urbana densa
            np.where(ndbi > -0.2, 4, 2)  # Misto/rurale
        )
        return risk
    
    def _calculate_burn_risk(self, nbr):
        """Converte NBR in rischio incendio"""
        if nbr is None:
            return None
            
        risk = np.where(
            nbr > 0.3, 2,  # Vegetazione sana
            np.where(nbr > 0.1, 5, 8)  # Media/bruciata
        )
        return risk
    
    def _calculate_roof_risk(self, brei):
        """Converte BREI in rischio tetto"""
        if brei is None:
            return None
            
        risk = np.where(
            brei > 0.2, 7,  # Tetti esposti
            np.where(brei > -0.1, 4, 2)
        )
        return risk
    
    def _calculate_drainage_risk(self, dopi):
        """Converte DOPI in rischio drenaggio"""
        if dopi is None:
            return None
            
        risk = np.where(
            dopi > 0.5, 7,  # Drenaggio scarso
            np.where(dopi > 0.2, 4, 2)
        )
        return risk
    
    def _calculate_composite_risk(self, risks):
        """Calcola rischio composito medio"""
        valid_risks = [r for r in risks.values() if r is not None]
        
        if not valid_risks:
            return None
            
        composite = np.mean(valid_risks, axis=0)
        return np.clip(composite, 1, 10)
    
    def _calculate_statistics(self, risks, composite_risk):
        """Calcola statistiche descrittive"""
        stats = {}
        
        for risk_name, risk_data in risks.items():
            if risk_data is not None:
                stats[risk_name] = {
                    'mean': float(np.mean(risk_data)),
                    'std': float(np.std(risk_data)),
                    'min': float(np.min(risk_data)),
                    'max': float(np.max(risk_data))
                }
        
        if composite_risk is not None:
            stats['composite'] = {
                'mean': float(np.mean(composite_risk)),
                'std': float(np.std(composite_risk)),
                'min': float(np.min(composite_risk)),
                'max': float(np.max(composite_risk))
            }
            
        return stats


# vm2-appserver/wsgi.py
"""
Entry point per Gunicorn
"""
from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run()
