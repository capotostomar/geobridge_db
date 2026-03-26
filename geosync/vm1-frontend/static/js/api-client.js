// vm1-frontend/static/js/api-client.js
/**
 * GeoBridge API Client
 * Gestisce tutte le chiamate API verso il backend (VM2)
 */

class GeoBridgeAPI {
    constructor(baseURL = '/api') {
        this.baseURL = baseURL;
    }

    /**
     * Helper generico per richieste HTTP
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        };

        const config = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `HTTP error ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // ===== AUTHENTICATION =====
    
    async login(email, password) {
        return await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    }

    async logout() {
        return await this.request('/auth/logout', {
            method: 'POST'
        });
    }

    async checkAuth() {
        return await this.request('/auth/check');
    }

    // ===== ANALYSIS =====
    
    async createAnalysis(bbox, startDate, endDate, intervalMonths = 6) {
        return await this.request('/analysis/create', {
            method: 'POST',
            body: JSON.stringify({
                bbox: bbox,
                start_date: startDate,
                end_date: endDate,
                interval_months: intervalMonths
            })
        });
    }

    async getAnalysis(analysisId) {
        return await this.request(`/analysis/${analysisId}`);
    }

    async getUserAnalyses() {
        return await this.request('/analysis/user');
    }

    async generatePDF(analysisId) {
        return await this.request(`/analysis/${analysisId}/pdf`);
    }

    // ===== UTILITIES =====
    
    async healthCheck() {
        return await this.request('/health');
    }
}


// vm1-frontend/static/js/map-manager.js
/**
 * Map Manager
 * Gestisce l'interfaccia mappa Leaflet e la selezione dell'area
 */

class MapManager {
    constructor(mapElementId, options = {}) {
        this.mapElementId = mapElementId;
        this.map = null;
        this.drawnItems = null;
        this.selectedBBox = null;
        this.riskLayers = [];
        
        // Callbacks
        this.onBBoxSelected = options.onBBoxSelected || null;
        this.onBBoxUpdated = options.onBBoxUpdated || null;
        this.onBBoxDeleted = options.onBBoxDeleted || null;
    }

    /**
     * Inizializza la mappa
     */
    initialize(center = [41.9028, 12.4964], zoom = 6) {
        // Crea mappa
        this.map = L.map(this.mapElementId).setView(center, zoom);

        // Aggiungi tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.map);

        // Layer per elementi disegnati
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);

        // Setup controlli disegno
        this._setupDrawControls();

        return this;
    }

    /**
     * Setup controlli per disegnare rettangoli
     */
    _setupDrawControls() {
        const drawControl = new L.Control.Draw({
            position: 'topright',
            draw: {
                polygon: false,
                polyline: false,
                circle: false,
                marker: false,
                circlemarker: false,
                rectangle: {
                    shapeOptions: {
                        color: '#3388ff',
                        weight: 2,
                        fillOpacity: 0.2
                    }
                }
            },
            edit: {
                featureGroup: this.drawnItems,
                remove: true
            }
        });

        this.map.addControl(drawControl);

        // Event: Nuovo rettangolo creato
        this.map.on(L.Draw.Event.CREATED, (event) => {
            const layer = event.layer;
            
            // Rimuovi rettangolo precedente
            this.drawnItems.clearLayers();
            
            // Aggiungi nuovo rettangolo
            this.drawnItems.addLayer(layer);
            
            // Estrai coordinate
            this._updateBBoxFromLayer(layer);
            
            if (this.onBBoxSelected) {
                this.onBBoxSelected(this.selectedBBox);
            }
        });

        // Event: Rettangolo modificato
        this.map.on(L.Draw.Event.EDITED, (event) => {
            const layers = event.layers;
            layers.eachLayer((layer) => {
                this._updateBBoxFromLayer(layer);
                
                if (this.onBBoxUpdated) {
                    this.onBBoxUpdated(this.selectedBBox);
                }
            });
        });

        // Event: Rettangolo eliminato
        this.map.on(L.Draw.Event.DELETED, () => {
            this.selectedBBox = null;
            
            if (this.onBBoxDeleted) {
                this.onBBoxDeleted();
            }
        });
    }

    /**
     * Estrae bbox da layer Leaflet
     */
    _updateBBoxFromLayer(layer) {
        const bounds = layer.getBounds();
        this.selectedBBox = {
            min_lon: bounds.getWest(),
            min_lat: bounds.getSouth(),
            max_lon: bounds.getEast(),
            max_lat: bounds.getNorth()
        };
    }

    /**
     * Ottieni bbox selezionato
     */
    getSelectedBBox() {
        return this.selectedBBox;
    }

    /**
     * Calcola area approssimativa in km²
     */
    calculateArea() {
        if (!this.selectedBBox) return 0;
        
        const width = Math.abs(this.selectedBBox.max_lon - this.selectedBBox.min_lon) * 111;
        const height = Math.abs(this.selectedBBox.max_lat - this.selectedBBox.min_lat) * 111;
        
        return (width * height).toFixed(2);
    }

    /**
     * Aggiungi layer con heatmap rischio
     */
    addRiskLayer(imageUrl, bbox, options = {}) {
        const bounds = [
            [bbox.min_lat, bbox.min_lon],
            [bbox.max_lat, bbox.max_lon]
        ];

        const overlay = L.imageOverlay(imageUrl, bounds, {
            opacity: options.opacity || 0.7,
            interactive: true
        }).addTo(this.map);

        this.riskLayers.push(overlay);

        // Centra mappa su layer
        this.map.fitBounds(bounds);

        return overlay;
    }

    /**
     * Rimuovi tutti i layer rischio
     */
    clearRiskLayers() {
        this.riskLayers.forEach(layer => {
            this.map.removeLayer(layer);
        });
        this.riskLayers = [];
    }

    /**
     * Centra mappa su bbox
     */
    fitToBBox(bbox) {
        const bounds = [
            [bbox.min_lat, bbox.min_lon],
            [bbox.max_lat, bbox.max_lon]
        ];
        this.map.fitBounds(bounds);
    }
}


// vm1-frontend/static/js/utils.js
/**
 * Utility Functions
 */

/**
 * Formatta data in italiano
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Formatta numero con separatori migliaia
 */
function formatNumber(num, decimals = 2) {
    return Number(num).toLocaleString('it-IT', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Determina livello rischio da punteggio
 */
function getRiskLevel(score) {
    if (score <= 2) {
        return { 
            class: 'very-low', 
            text: 'Rischio Molto Basso',
            color: '#22c55e'
        };
    } else if (score <= 4) {
        return { 
            class: 'low', 
            text: 'Rischio Basso',
            color: '#84cc16'
        };
    } else if (score <= 6) {
        return { 
            class: 'moderate', 
            text: 'Rischio Moderato',
            color: '#f59e0b'
        };
    } else if (score <= 8) {
        return { 
            class: 'high', 
            text: 'Rischio Alto',
            color: '#ef4444'
        };
    } else {
        return { 
            class: 'critical', 
            text: 'Rischio Critico',
            color: '#dc2626'
        };
    }
}

/**
 * Valida email
 */
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Valida date
 */
function validateDates(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    
    if (start >= end) {
        return { valid: false, error: 'La data di inizio deve essere precedente alla data di fine' };
    }
    
    if (end > now) {
        return { valid: false, error: 'La data di fine non può essere futura' };
    }
    
    return { valid: true };
}

/**
 * Mostra notifica toast
 */
function showToast(message, type = 'info') {
    // Implementazione semplice - può essere migliorata con librerie
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
        color: white;
        border-radius: 6px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// vm1-frontend/static/js/app.js
/**
 * Main Application Logic
 */

(function() {
    'use strict';

    // Inizializza quando DOM è pronto
    document.addEventListener('DOMContentLoaded', init);

    let api, mapManager;

    function init() {
        // Verifica se siamo sulla pagina principale
        if (!document.getElementById('map')) return;

        // Inizializza API client
        api = new GeoBridgeAPI();

        // Inizializza mappa
        mapManager = new MapManager('map', {
            onBBoxSelected: handleBBoxSelected,
            onBBoxDeleted: handleBBoxDeleted
        });
        mapManager.initialize();

        // Setup event listeners
        setupEventListeners();

        // Imposta date di default
        setDefaultDates();

        // Check autenticazione
        checkAuthentication();
    }

    function setupEventListeners() {
        const analyzeBtn = document.getElementById('analyze-btn');
        const logoutBtn = document.getElementById('logout-btn');

        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', handleAnalyze);
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    }

    function setDefaultDates() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        document.getElementById('start-date').value = startDate.toISOString().split('T')[0];
        document.getElementById('end-date').value = endDate.toISOString().split('T')[0];
    }

    async function checkAuthentication() {
        try {
            await api.checkAuth();
        } catch (error) {
            console.error('Not authenticated');
            window.location.href = '/login';
        }
    }

    function handleBBoxSelected(bbox) {
        const analyzeBtn = document.getElementById('analyze-btn');
        const bboxInfo = document.getElementById('bbox-info');

        analyzeBtn.disabled = false;

        const area = mapManager.calculateArea();
        bboxInfo.innerHTML = `
            <strong>Area selezionata:</strong><br>
            Latitudine: ${bbox.min_lat.toFixed(4)}° - ${bbox.max_lat.toFixed(4)}°<br>
            Longitudine: ${bbox.min_lon.toFixed(4)}° - ${bbox.max_lon.toFixed(4)}°<br>
            Area approssimativa: ~${area} km²
        `;
    }

    function handleBBoxDeleted() {
        document.getElementById('analyze-btn').disabled = true;
        document.getElementById('bbox-info').innerHTML = '';
    }

    async function handleAnalyze() {
        const bbox = mapManager.getSelectedBBox();
        
        if (!bbox) {
            showToast('Seleziona un\'area sulla mappa', 'error');
            return;
        }

        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        const interval = parseInt(document.getElementById('interval').value);

        // Valida date
        const validation = validateDates(startDate, endDate);
        if (!validation.valid) {
            showToast(validation.error, 'error');
            return;
        }

        // UI feedback
        const loadingDiv = document.getElementById('loading');
        const resultsDiv = document.getElementById('results');
        const analyzeBtn = document.getElementById('analyze-btn');

        loadingDiv.style.display = 'block';
        resultsDiv.style.display = 'none';
        analyzeBtn.disabled = true;

        try {
            const response = await api.createAnalysis(bbox, startDate, endDate, interval);

            loadingDiv.style.display = 'none';
            analyzeBtn.disabled = false;

            if (response.status === 'success') {
                showToast('Analisi completata con successo!', 'success');
                displayResults(response.results, response.analysis_id);
            }

        } catch (error) {
            console.error('Analisi fallita:', error);
            loadingDiv.style.display = 'none';
            analyzeBtn.disabled = false;
            showToast('Errore durante l\'analisi: ' + error.message, 'error');
        }
    }

    function displayResults(results, analysisId) {
        const resultsDiv = document.getElementById('results');
        const resultsContent = document.getElementById('results-content');

        let html = '';

        results.forEach((result, index) => {
            const stats = result.statistics.composite;
            const riskLevel = getRiskLevel(stats.mean);

            html += `
                <div class="result-card">
                    <h4>Periodo: ${result.period}</h4>
                    <div class="risk-score ${riskLevel.class}">
                        <span class="score">${stats.mean.toFixed(2)}</span>
                        <span class="level">${riskLevel.text}</span>
                    </div>
                    <div class="risk-details">
                        <p><strong>Range:</strong> ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)}</p>
                        <p><strong>Deviazione standard:</strong> ${stats.std.toFixed(2)}</p>
                        <p><strong>Fattori di rischio analizzati:</strong></p>
                        <ul>
                            ${Object.keys(result.statistics).filter(k => k !== 'composite').map(key => 
                                `<li>${formatRiskFactorName(key)}: ${result.statistics[key].mean.toFixed(2)}</li>`
                            ).join('')}
                        </ul>
                    </div>
                </div>
            `;
        });

        html += `
            <div class="mt-3">
                <button class="btn btn-primary" onclick="downloadPDF(${analysisId})">
                    📄 Scarica Report Completo (PDF)
                </button>
            </div>
        `;

        resultsContent.innerHTML = html;
        resultsDiv.style.display = 'block';

        // Scroll a risultati
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
    }

    function formatRiskFactorName(key) {
        const names = {
            'vegetation_risk': 'Rischio Vegetazione',
            'water_risk': 'Rischio Idrico',
            'urban_risk': 'Rischio Urbano',
            'burn_risk': 'Rischio Incendi',
            'roof_risk': 'Rischio Tetti',
            'drainage_risk': 'Rischio Drenaggio'
        };
        return names[key] || key;
    }

    async function handleLogout(e) {
        e.preventDefault();
        
        try {
            await api.logout();
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
            showToast('Errore durante il logout', 'error');
        }
    }

    // Funzione globale per download PDF
    window.downloadPDF = async function(analysisId) {
        try {
            const response = await api.generatePDF(analysisId);
            window.open(response.pdf_url, '_blank');
        } catch (error) {
            console.error('Errore generazione PDF:', error);
            showToast('Errore durante la generazione del PDF', 'error');
        }
    };

})();
