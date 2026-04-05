/**
 * GeoBridge Public API — OpenAPI 3.0 Specification
 *
 * Base URL: /api/v1
 * Auth: Bearer token (API Key)
 */

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'GeoBridge API',
    version: '1.0.0',
    description: `API pubblica per l'analisi di rischio ambientale basata su indici satellitari.

## Indici Spettrali
- **NDVI** — Normalized Difference Vegetation Index (vigor vegetale)
- **NDMI** — Normalized Difference Moisture Index (umidità suolo)
- **NBR** — Normalized Burn Ratio (rischio incendi)
- **NDBI** — Normalized Difference Built-up Index (urbanizzazione)
- **BREI** — Bare Soil Exposure Index (suolo nudo)
- **DOPI** — Degree of Primary Productivity Index (produttività)

## Autenticazione
Tutte le richieste richiedono un'API Key tramite header \`Authorization: Bearer <key>\` oppure query parameter \`?api_key=<key>\`.

## Limiti
- Massimo 100 richieste/ora per API key
- Le coordinate devono essere in formato [lat, lon]
- I dati sono generati da modelli simulati basati su profili geografici`,
    contact: {
      name: 'GeoBridge Team',
      email: 'api@geobridge.dev',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 (corrente)',
    },
  ],
  tags: [
    { name: 'Analyses', description: 'Gestione analisi di rischio' },
    { name: 'Indices', description: 'Lookup puntuale degli indici' },
    { name: 'Streaming', description: 'WebSocket per risultati in streaming' },
    { name: 'Authentication', description: 'Gestione API Keys' },
  ],
  paths: {
    '/analyses': {
      post: {
        tags: ['Analyses'],
        summary: 'Crea una nuova analisi',
        description: 'Avvia un\'analisi di rischio ambientale per un\'area specificata tramite coordinate e intervallo temporale. Richiede permesso "write".',
        operationId: 'createAnalysis',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateAnalysisRequest' },
              examples: {
                milano: {
                  summary: 'Parco Nord Milano',
                  value: {
                    title: 'Parco Nord Milano',
                    coordinates: [[45.52, 9.18], [45.52, 9.22], [45.50, 9.22], [45.50, 9.18]],
                    start_date: '2022-01-01',
                    end_date: '2024-12-31',
                    address: 'Milano, Italia',
                  },
                },
                sardegna: {
                  summary: 'Costa Smeralda',
                  value: {
                    title: 'Costa Smeralda',
                    coordinates: [[41.15, 9.50], [41.15, 9.58], [41.10, 9.58], [41.10, 9.50]],
                    start_date: '2023-01-01',
                    end_date: '2024-06-30',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Analisi creata con successo',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AnalysisResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/analyses/{id}': {
      get: {
        tags: ['Analyses'],
        summary: 'Recupera risultati di un\'analisi',
        description: 'Restituisce i risultati completi di un\'analisi precedentemente creata.',
        operationId: 'getAnalysis',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'ID dell\'analisi (CUID)',
            schema: { type: 'string' },
            example: 'clxxxxxxxxxxxxxxxxxxxx',
          },
        ],
        responses: {
          '200': {
            description: 'Risultati dell\'analisi',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AnalysisResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/indices/{lat}/{lon}': {
      get: {
        tags: ['Indices'],
        summary: 'Indici spettrali puntuale',
        description: 'Restituisce gli indici spettrali (NDVI, NDMI, NBR, NDBI, BREI, DOPI) e i punteggi di rischio per un punto specifico in una data.',
        operationId: 'getPointIndices',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'lat',
            in: 'path',
            required: true,
            description: 'Latitudine (-90..90)',
            schema: { type: 'number', minimum: -90, maximum: 90 },
            example: 41.90,
          },
          {
            name: 'lon',
            in: 'path',
            required: true,
            description: 'Longitudine (-180..180)',
            schema: { type: 'number', minimum: -180, maximum: 180 },
            example: 12.50,
          },
          {
            name: 'date',
            in: 'query',
            required: false,
            description: 'Data di riferimento (YYYY-MM-DD, default: oggi)',
            schema: { type: 'string', format: 'date' },
            example: '2024-06-15',
          },
        ],
        responses: {
          '200': {
            description: 'Indici puntuale',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PointIndicesResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API Key ottenuta dal pannello di gestione. Formato: Authorization: Bearer gb_xxxx...',
      },
    },
    responses: {
      BadRequest: {
        description: 'Errore di validazione',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Validation error', message: '"title" is required (string)' },
          },
        },
      },
      Unauthorized: {
        description: 'API Key mancante o non valida',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Unauthorized', message: 'Invalid API key' },
          },
        },
      },
      Forbidden: {
        description: 'Permessi insufficienti',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Forbidden', message: 'Write permission required' },
          },
        },
      },
      NotFound: {
        description: 'Risorsa non trovata',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Not found', message: 'Analysis with id "xxx" not found' },
          },
        },
      },
      InternalError: {
        description: 'Errore interno del server',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Internal server error', message: 'An unexpected error occurred' },
          },
        },
      },
    },
    schemas: {
      CreateAnalysisRequest: {
        type: 'object',
        required: ['title', 'coordinates', 'start_date', 'end_date'],
        properties: {
          title: { type: 'string', description: 'Nome dell\'analisi', example: 'Parco Nord Milano' },
          address: { type: 'string', description: 'Indirizzo (opzionale)', example: 'Milano, Italia' },
          coordinates: {
            type: 'array',
            description: 'Coordinate del poligono [lat, lon] (min 3 punti)',
            items: {
              type: 'array',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
            minItems: 3,
            example: [[45.52, 9.18], [45.52, 9.22], [45.50, 9.22], [45.50, 9.18]],
          },
          start_date: { type: 'string', format: 'date', description: 'Data inizio (YYYY-MM-DD)', example: '2022-01-01' },
          end_date: { type: 'string', format: 'date', description: 'Data fine (YYYY-MM-DD)', example: '2024-12-31' },
          area_type: { type: 'string', enum: ['polygon', 'rectangle'], default: 'polygon', description: 'Tipo di area' },
          analysis_mode: { type: 'string', enum: ['snapshot', 'timeseries'], default: 'timeseries', description: 'Modalità analisi' },
        },
      },
      PeriodResult: {
        type: 'object',
        properties: {
          period: { type: 'string', description: 'Etichetta periodo', example: '2023-01 / 2023-06' },
          date: { type: 'string', format: 'date-time' },
          ndvi: { type: 'number', description: 'NDVI (-1 to 1)', example: 0.45 },
          ndmi: { type: 'number', description: 'NDMI (-1 to 1)', example: 0.32 },
          nbr: { type: 'number', description: 'NBR (-1 to 1)', example: 0.55 },
          ndbi: { type: 'number', description: 'NDBI (-1 to 1)', example: 0.12 },
          brei: { type: 'number', description: 'BREI (-1 to 1)', example: 0.18 },
          dopi: { type: 'number', description: 'DOPI (-1 to 1)', example: 0.08 },
          vegetationRisk: { type: 'integer', description: 'Rischio vegetazione (0-100)', example: 35 },
          waterRisk: { type: 'integer', description: 'Rischio idrico (0-100)', example: 22 },
          urbanRisk: { type: 'integer', description: 'Rischio urbanizzazione (0-100)', example: 32 },
          fireRisk: { type: 'integer', description: 'Rischio incendi (0-100)', example: 18 },
          compositeRisk: { type: 'integer', description: 'Rischio composito (0-100)', example: 28 },
          riskLevel: { type: 'string', enum: ['basso', 'medio', 'alto', 'critico'], example: 'medio' },
        },
      },
      IndexResult: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'NDVI' },
          fullName: { type: 'string', example: 'Normalized Difference Vegetation Index' },
          value: { type: 'number', example: 0.45 },
          description: { type: 'string', example: 'Vigor vegetale' },
          interpretation: { type: 'string', example: 'Vegetazione stressata' },
          trend: { type: 'string', enum: ['stable', 'improving', 'degrading'], example: 'degrading' },
          trendValue: { type: 'number', example: -0.05 },
        },
      },
      RiskCategory: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Vegetazione' },
          score: { type: 'integer', example: 35 },
          level: { type: 'string', enum: ['basso', 'medio', 'alto', 'critico'], example: 'medio' },
          description: { type: 'string' },
          factors: { type: 'array', items: { type: 'string' }, example: ['NDVI', 'BREI'] },
        },
      },
      AnalysisResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', example: 'analysis' },
              attributes: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  address: { type: 'string', nullable: true },
                  area_km2: { type: 'number' },
                  area_type: { type: 'string' },
                  coordinates: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                  start_date: { type: 'string' },
                  end_date: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
                  analysis_mode: { type: 'string' },
                  composite_score: { type: 'number' },
                  composite_level: { type: 'string', enum: ['basso', 'medio', 'alto', 'critico'] },
                  summary: { type: 'string' },
                  periods: { type: 'array', items: { $ref: '#/components/schemas/PeriodResult' } },
                  indices: { type: 'array', items: { $ref: '#/components/schemas/IndexResult' } },
                  categories: { type: 'array', items: { $ref: '#/components/schemas/RiskCategory' } },
                  recommendations: { type: 'array', items: { type: 'string' } },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  created_at: { type: 'string', format: 'date-time' },
                  completed_at: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
          },
        },
      },
      PointIndicesResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              type: { type: 'string', example: 'point_indices' },
              attributes: {
                type: 'object',
                properties: {
                  latitude: { type: 'number' },
                  longitude: { type: 'number' },
                  date: { type: 'string', format: 'date' },
                  profile: { type: 'string', enum: ['alpine', 'padana', 'appenninica', 'mediterranean'], description: 'Profilo geografico' },
                  season: { type: 'string', enum: ['summer', 'winter'] },
                  indices: {
                    type: 'object',
                    description: 'Indici spettrali',
                    properties: {
                      NDVI: { $ref: '#/components/schemas/SpectralIndex' },
                      NDMI: { $ref: '#/components/schemas/SpectralIndex' },
                      NBR: { $ref: '#/components/schemas/SpectralIndex' },
                      NDBI: { $ref: '#/components/schemas/SpectralIndex' },
                      BREI: { $ref: '#/components/schemas/SpectralIndex' },
                      DOPI: { $ref: '#/components/schemas/SpectralIndex' },
                    },
                  },
                  risk_scores: {
                    type: 'object',
                    properties: {
                      vegetation: { $ref: '#/components/schemas/RiskScore' },
                      water: { $ref: '#/components/schemas/RiskScore' },
                      urban: { $ref: '#/components/schemas/RiskScore' },
                      fire: { $ref: '#/components/schemas/RiskScore' },
                      composite: { $ref: '#/components/schemas/RiskScore' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      SpectralIndex: {
        type: 'object',
        properties: {
          value: { type: 'number', description: 'Valore dell\'indice' },
          full_name: { type: 'string', description: 'Nome completo' },
          description: { type: 'string', description: 'Descrizione' },
        },
      },
      RiskScore: {
        type: 'object',
        properties: {
          score: { type: 'integer', description: 'Punteggio 0-100' },
          level: { type: 'string', enum: ['basso', 'medio', 'alto', 'critico'] },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Tipo errore' },
          message: { type: 'string', description: 'Dettaglio errore' },
        },
      },
    },
  },
} as const

export default spec

// ─── Endpoint to serve the spec ────────────────────────────────────────────
export function getOpenApiSpec() {
  return spec
}
