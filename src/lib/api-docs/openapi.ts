import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi'
import { 
  CreateAnalysisRequestSchema, 
  AnalysisResponseSchema,
  ApiSuccessResponseSchema,
  ApiErrorResponseSchema,
} from './schemas'
import { registry, AnalysisIdParam, FormatQueryParam, NotFoundResponse, UnauthorizedResponse } from './components'

// Crea una registry per la versione v1 dell'API
const v1Registry = new OpenAPIRegistry()

// ─────────────────────────────────────────────────────────────
// DEFINIZIONE ENDPOINT: POST /api/v1/analyses
// ─────────────────────────────────────────────────────────────

v1Registry.registerPath({
  method: 'post',
  path: '/api/v1/analyses',
  summary: 'Crea una nuova analisi satellitare',
  description: `
Avvia un'analisi satellitare su un'area definita da poligono.

**Flusso:**
1. Invia richiesta con coordinate e date
2. Il sistema processa i dati Sentinel-2 da Copernicus
3. Ricevi i risultati con indici vegetazionali (NDVI, NDMI, ecc.)

**Tempi di elaborazione:** 10-60 secondi a seconda dell'area.
Utilizza l'endpoint GET /analyses/{id} per pollare lo stato.
  `.trim(),
  tags: ['Analisi'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAnalysisRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Analisi creata con successo',
      content: {
        'application/json': {
          schema: ApiSuccessResponseSchema,
        },
      },
    },
    400: {
      description: 'Request validation failed',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    401: UnauthorizedResponse,
    403: {
      description: 'API key senza permessi di scrittura',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Errore interno del server',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
})

// ─────────────────────────────────────────────────────────────
// DEFINIZIONE ENDPOINT: GET /api/v1/analyses/{id}
// ─────────────────────────────────────────────────────────────

v1Registry.registerPath({
  method: 'get',
  path: '/api/v1/analyses/{id}',
  summary: 'Ottieni i dettagli di un\'analisi',
  description: 'Recupera lo stato e i risultati di un\'analisi precedentemente creata.',
  tags: ['Analisi'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: AnalysisIdParam,
  },
  responses: {
    200: {
      description: 'Dati dell\'analisi',
      content: {
        'application/json': {
          schema: AnalysisResponseSchema,
        },
      },
    },
    404: NotFoundResponse,
    401: UnauthorizedResponse,
  },
})

// ─────────────────────────────────────────────────────────────
// DEFINIZIONE ENDPOINT: GET /api/v1/analyses/{id}/export
// ─────────────────────────────────────────────────────────────

v1Registry.registerPath({
  method: 'get',
  path: '/api/v1/analyses/{id}/export',
  summary: 'Esporta i risultati di un\'analisi',
  description: 'Scarica i risultati in formato CSV o GeoJSON per uso esterno.',
  tags: ['Analisi', 'Export'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: AnalysisIdParam,
    query: FormatQueryParam,
  },
  responses: {
    200: {
      description: 'File pronto per il download',
      content: {
        'text/csv': { schema: { type: 'string', format: 'binary' } },
        'application/geo+json': { schema: { type: 'object' } },
        'application/json': { schema: AnalysisResponseSchema },
      },
    },
    404: NotFoundResponse,
    401: UnauthorizedResponse,
  },
})

// ─────────────────────────────────────────────────────────────
// GENERAZIONE DOCUMENTO OPENAPI COMPLETO
// ─────────────────────────────────────────────────────────────

export function generateOpenApiDocument() {
  // Unisci le registry
  const combinedRegistry = new OpenAPIRegistry([registry, v1Registry])

  const generator = new OpenApiGeneratorV3(combinedRegistry.definitions)

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'GeoBridge API',
      version: '1.0.0',
      description: `
API per l'analisi di dati satellitari Sentinel-2 tramite Copernicus Data Space.

**Funzionalità:**
- 🛰️ Analisi NDVI, NDMI, NBR, NDBI, EVI su aree personalizzate
- 📊 Serie temporali con aggregazione giornaliera o decadica
- 📤 Export in CSV/GeoJSON per integrazione con GIS
- 🔔 Alert automatici (in sviluppo)

**Autenticazione:**
Tutte le richieste richiedono l'header \`X-API-Key\`. 
[Contattaci](mailto:api@geobridge.example) per richiedere una chiave.

**Rate Limits:**
- Piano Free: 10 richieste/ora, aree ≤ 10 km²
- Piano Pro: 100 richieste/ora, aree ≤ 100 km²
      `.trim(),
      contact: {
        name: 'GeoBridge Support',
        email: 'support@geobridge.example',
        url: 'https://geobridge-db.vercel.app',
      },
    },
    servers: [
      {
        url: 'https://geobridge-db.vercel.app',
        description: 'Production (Vercel)',
      },
      {
        url: 'http://localhost:3000',
        description: 'Development (locale)',
      },
    ],
    tags: [
      { name: 'Analisi', description: 'Gestione analisi satellitari' },
      { name: 'Export', description: 'Esportazione dati' },
      { name: 'Auth', description: 'Autenticazione e API keys' },
    ],
  })
}