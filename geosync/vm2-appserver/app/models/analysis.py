# vm2-appserver/app/models/analysis.py
"""
Modello per gestione analisi
"""
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from datetime import datetime
import os

class Database:
    """Singleton per gestione connessione database"""
    _connection = None
    
    @classmethod
    def get_connection(cls):
        if cls._connection is None or cls._connection.closed:
            cls._connection = psycopg2.connect(
                os.environ.get('DATABASE_URL'),
                cursor_factory=RealDictCursor
            )
        return cls._connection
    
    @classmethod
    def close_connection(cls):
        if cls._connection and not cls._connection.closed:
            cls._connection.close()


class Analysis:
    """Modello per analisi satellitari"""
    
    def __init__(self, id=None, user_id=None, bbox_coords=None, 
                 start_date=None, end_date=None, interval_months=6,
                 status='pending', created_at=None, completed_at=None):
        self.id = id
        self.user_id = user_id
        self.bbox_coords = bbox_coords
        self.start_date = start_date
        self.end_date = end_date
        self.interval_months = interval_months
        self.status = status
        self.created_at = created_at
        self.completed_at = completed_at
        self.results = []
    
    @classmethod
    def create(cls, user_id, bbox, start_date, end_date, interval_months=6):
        """Crea nuova analisi nel database"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        
        query = """
            INSERT INTO analyses (user_id, bbox_coords, start_date, end_date, interval_months)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, created_at
        """
        
        cursor.execute(query, (
            user_id,
            json.dumps(bbox),
            start_date,
            end_date,
            interval_months
        ))
        
        result = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        analysis = cls(
            id=result['id'],
            user_id=user_id,
            bbox_coords=bbox,
            start_date=start_date,
            end_date=end_date,
            interval_months=interval_months,
            created_at=result['created_at']
        )
        
        return analysis
    
    @classmethod
    def get_by_id(cls, analysis_id):
        """Recupera analisi per ID"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT * FROM analyses WHERE id = %s
        """
        
        cursor.execute(query, (analysis_id,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        analysis = cls(
            id=row['id'],
            user_id=row['user_id'],
            bbox_coords=row['bbox_coords'],
            start_date=row['start_date'],
            end_date=row['end_date'],
            interval_months=row['interval_months'],
            status=row['status'],
            created_at=row['created_at'],
            completed_at=row['completed_at']
        )
        
        # Carica risultati
        analysis.load_results()
        
        return analysis
    
    def save_results(self, results):
        """Salva risultati analisi"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        
        for result in results:
            query = """
                INSERT INTO analysis_results 
                (analysis_id, period_date, ndvi_avg, ndmi_avg, nbr_avg, 
                 ndbi_avg, composite_risk, risk_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            stats = result['statistics']
            
            cursor.execute(query, (
                self.id,
                result['period'],
                stats.get('vegetation_risk', {}).get('mean'),
                stats.get('water_risk', {}).get('mean'),
                stats.get('burn_risk', {}).get('mean'),
                stats.get('urban_risk', {}).get('mean'),
                stats.get('composite', {}).get('mean'),
                json.dumps(result)
            ))
        
        # Aggiorna stato analisi
        cursor.execute(
            "UPDATE analyses SET status = %s, completed_at = %s WHERE id = %s",
            ('completed', datetime.now(), self.id)
        )
        
        conn.commit()
        cursor.close()
        
        self.status = 'completed'
        self.completed_at = datetime.now()
    
    def load_results(self):
        """Carica risultati dal database"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        
        query = """
            SELECT * FROM analysis_results 
            WHERE analysis_id = %s 
            ORDER BY period_date
        """
        
        cursor.execute(query, (self.id,))
        rows = cursor.fetchall()
        cursor.close()
        
        self.results = [dict(row) for row in rows]
    
    def to_dict(self):
        """Converte in dizionario per JSON"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'bbox_coords': self.bbox_coords,
            'start_date': str(self.start_date),
            'end_date': str(self.end_date),
            'interval_months': self.interval_months,
            'status': self.status,
            'created_at': str(self.created_at) if self.created_at else None,
            'completed_at': str(self.completed_at) if self.completed_at else None,
            'results': self.results
        }


class User:
    """Modello per utenti"""
    
    def __init__(self, id=None, email=None, password_hash=None, 
                 created_at=None, last_login=None):
        self.id = id
        self.email = email
        self.password_hash = password_hash
        self.created_at = created_at
        self.last_login = last_login
    
    @classmethod
    def create(cls, email, password_hash):
        """Crea nuovo utente"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        
        query = """
            INSERT INTO users (email, password_hash)
            VALUES (%s, %s)
            RETURNING id, created_at
        """
        
        cursor.execute(query, (email, password_hash))
        result = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        return cls(
            id=result['id'],
            email=email,
            password_hash=password_hash,
            created_at=result['created_at']
        )
    
    @classmethod
    def get_by_email(cls, email):
        """Trova utente per email"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        
        query = "SELECT * FROM users WHERE email = %s"
        cursor.execute(query, (email,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return None
        
        return cls(
            id=row['id'],
            email=row['email'],
            password_hash=row['password_hash'],
            created_at=row['created_at'],
            last_login=row['last_login']
        )
    
    def update_last_login(self):
        """Aggiorna timestamp ultimo login"""
        conn = Database.get_connection()
        cursor = conn.cursor()
        
        query = "UPDATE users SET last_login = %s WHERE id = %s"
        cursor.execute(query, (datetime.now(), self.id))
        conn.commit()
        cursor.close()
        
        self.last_login = datetime.now()


# vm2-appserver/app/config.py
"""
Configurazioni applicazione
"""
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Configurazione base"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    DATABASE_URL = os.environ.get('DATABASE_URL')
    
    # Sentinel Hub
    SH_CLIENT_ID = os.environ.get('SH_CLIENT_ID')
    SH_CLIENT_SECRET = os.environ.get('SH_CLIENT_SECRET')
    
    # Flask
    JSON_SORT_KEYS = False
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max upload
    
    # Session
    SESSION_COOKIE_SECURE = True  # Solo HTTPS in produzione
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 86400  # 24 ore


class DevelopmentConfig(Config):
    """Configurazione sviluppo"""
    DEBUG = True
    TESTING = False
    SESSION_COOKIE_SECURE = False


class ProductionConfig(Config):
    """Configurazione produzione"""
    DEBUG = False
    TESTING = False


# Seleziona configurazione basata su environment
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}


# vm2-appserver/gunicorn_config.py
"""
Configurazione Gunicorn
"""
import multiprocessing

# Binding
bind = "0.0.0.0:5000"

# Workers
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
worker_connections = 1000
max_requests = 1000  # Restart worker dopo N richieste
max_requests_jitter = 50

# Timeout
timeout = 300  # 5 minuti per elaborazioni lunghe
graceful_timeout = 30
keepalive = 2

# Logging
accesslog = "/var/log/geobridge/access.log"
errorlog = "/var/log/geobridge/error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "geobridge"

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190


# vm2-appserver/requirements.txt
# Flask e web
flask==3.0.0
flask-cors==4.0.0
gunicorn==21.2.0
python-dotenv==1.0.0

# Database
psycopg2-binary==2.9.9

# Sentinel Hub e elaborazione immagini
sentinelhub==3.10.2
numpy==1.26.2
scipy==1.11.4
pillow==10.1.0
matplotlib==3.8.2

# Report PDF
reportlab==4.0.7

# Data handling
python-dateutil==2.8.2

# Security
werkzeug==3.0.1
bcrypt==4.1.1

# Monitoring (opzionale)
prometheus-flask-exporter==0.22.4


# vm3-database/init/init.sql
-- Database initialization script
-- Run with: psql -U geobridge_user -d geobridge -h localhost < init.sql

-- Estensioni
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabella Utenti
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabella Analisi
CREATE TABLE IF NOT EXISTS analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    bbox_coords JSONB NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    interval_months INTEGER DEFAULT 6,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Tabella Risultati Analisi
CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    analysis_id INTEGER REFERENCES analyses(id) ON DELETE CASCADE,
    period_date DATE NOT NULL,
    ndvi_avg FLOAT,
    ndmi_avg FLOAT,
    nbr_avg FLOAT,
    ndbi_avg FLOAT,
    brei_avg FLOAT,
    dopi_avg FLOAT,
    composite_risk FLOAT,
    risk_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella Sessioni (opzionale, per gestione sessioni in DB)
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    data JSONB,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_results_analysis_id ON analysis_results(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_period_date ON analysis_results(period_date);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Funzione per pulizia sessioni scadute
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Crea utente demo (per testing)
INSERT INTO users (email, password_hash) 
VALUES ('admin@customsat.it', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYzwLRiwJW6')
ON CONFLICT (email) DO NOTHING;
-- Password: password (da cambiare in produzione!)

-- Views utili
CREATE OR REPLACE VIEW user_analysis_summary AS
SELECT 
    u.id as user_id,
    u.email,
    COUNT(a.id) as total_analyses,
    COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_analyses,
    COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as pending_analyses,
    MAX(a.created_at) as last_analysis_date
FROM users u
LEFT JOIN analyses a ON u.id = a.user_id
GROUP BY u.id, u.email;

-- Trigger per aggiornamento automatico completed_at
CREATE OR REPLACE FUNCTION update_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_completed_at
BEFORE UPDATE ON analyses
FOR EACH ROW
EXECUTE FUNCTION update_completed_at();

-- Permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO geobridge_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO geobridge_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO geobridge_user;
