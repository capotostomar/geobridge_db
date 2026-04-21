// src/lib/api-docs/openapi.ts
// ✅ Versione robusta per Next.js + Turbopack

import { z as zod } from 'zod'
import { 
  extendZodWithOpenApi, 
  OpenAPIRegistry, 
  OpenApiGeneratorV3,
  type ZodOpenApiMetadata
} from '@asteasolutions/zod-to-openapi'

// 1️⃣ Estendi Zod UNA VOLTA SOLA (singleton pattern)
// Usiamo un flag per evitare double-extension in hot-reload
if (!(zod as any)._openapiExtended) {
  extendZodWithOpenApi(zod)
  ;(zod as any)._openapiExtended = true
}

// Alias locale per chiarezza
const z = zod

// 2️⃣ Registry centrale
const registry = new OpenAPIRegistry()

// ─────────────────────────────────────────────────────────────
// SECURITY & COMPONENTS
// ─────────────────────────────────────────────────────────────

registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-API-Key',
  description: 'API Key per autenticazione.',
})

const AnalysisIdParam = registry.registerParameter('AnalysisIdParam', {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'ID univoco dell\'analisi (UUID v4)',
} as const)

const NotFoundResponse = {
  description: 'Risorsa non trovata',
  content: { 
    'application/json': { 
      schema: { 
        type: 'object', 
        properties: { 
          error: { type: 'string', example: 'Not Found' }, 
          message: { type: 'string', example: 'Analysis not found' } 
        } 
      } 
    } 
  },
} as const

const UnauthorizedResponse = {
  description: 'Autenticazione fallita',
  content: { 
    'application/json': { 
      schema: { 
        type: 'object', 
        properties: { 
          error: { type: 'string', example: 'Unauthorized' }, 
          message: { type: 'string', example: 'Invalid API key' } 
        } 
      } 
    } 
  },
} as const

// ─────────────────────────────────────────────────────────────
// SCHEMAS BASE (con .openapi() chiamato DOPO l'extension)
// ─────────────────────────────────────────────────────────────

const CoordinateSchema = z
  .tuple([
    z.number().min(-90).max(90),
    z.number().min(-180).max(180),
  ])
  .openapi({ ref: 'Coordinate' })

const PolygonSchema = z
  .array(CoordinateSchema)
  .min(3)
  .openapi({ ref: 'Polygon' })

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .openapi({ ref: 'DateString' })

// ─────────────────────────────────────────────────────────────
// REQUEST/RESPONSE SCHEMAS
// ─────────────────────────────────────────────────────────────

export const CreateAnalysisRequestSchema = z
  .object({
    title: z.string().min(1).max(200).openapi({ 
      description: 'Titolo dell\'analisi', 
      example: 'Monitoraggio campo agricolo - Puglia' 
    }),
    coordinates: PolygonSchema.openapi({ 
      description: 'Coordinate del poligono [lat, lon]', 
      example: [[41.9, 12.5], [41.9, 12.6], [42.0, 12.55]] 
    }),
    start_date: DateStringSchema.openapi({ 
      description: 'Data inizio (YYYY-MM-DD)', 
      example: '2024-01-01' 
    }),
    end_date: DateStringSchema.openapi({ 
      description: 'Data fine (YYYY-MM-DD)', 
      example: '2024-06-30' 
    }),
    address: z.string().optional().openapi({ 
      description: 'Indirizzo o descrizione area' 
    }),
    area_type: z.enum(['polygon', 'rectangle', 'circle']).optional().openapi({ 
      default: 'polygon' 
    }),
    analysis_mode: z.enum(['timeseries', 'single_date']).optional().openapi({ 
      default: 'timeseries' 
    }),
    use_mock: z.boolean().optional().openapi({ 
      description: 'Forza dati mock per testing', 
      default: false 
    }),
  })
  .openapi({ ref: 'CreateAnalysisRequest' })

export const AnalysisResponseSchema = z
  .object({
    id: z.string().uuid().openapi({ example: 'cce2cdbb-0bd9-46b6-a06f-8b9b2155b526' }),
    title: z.string(),
    address: z.string().nullable(),
    area_km2: z.number().positive(),
    area_type: z.string(),
    coordinates: z.array(CoordinateSchema),
    start_date: z.string(),
    end_date: z.string(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    composite_score: z.number().min(0).max(100).nullable(),
    composite_level: z.enum(['low', 'medium', 'high', 'unknown']).nullable(),
    summary: z.string(),
    periods: z.array(z.object({ 
      date: z.string(), 
      ndvi: z.number().nullable(), 
      ndwi: z.number().nullable() 
    })),
    indices: z.array(z.string()),
    categories: z.array(z.string()),
    recommendations: z.array(z.string()),
    created_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable(),
  })
  .openapi({ ref: 'AnalysisResponse' })

const ApiSuccessResponseSchema = z
  .object({ 
    success: z.literal(true), 
    data: AnalysisResponseSchema 
  })
  .openapi({ ref: 'ApiSuccessResponse' })

const ApiErrorResponseSchema = z
  .object({ 
    error: z.string(), 
    message: z.string(), 
    details: z.record(z.unknown()).optional() 
  })
  .openapi({ ref: 'ApiErrorResponse' })

// ─────────────────────────────────────────────────────────────
// ENDPOINT REGISTRATION
// ─────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/api/v1/analyses',
  summary: 'Crea una nuova analisi satellitare',
  description: 'Avvia un\'analisi satellitare su un\'area definita da poligono.',
  tags: ['Analisi'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: CreateAnalysisRequestSchema } },
    },
  },
  responses: {
    201: { 
      description: 'Analisi creata con successo', 
      content: { 'application/json': { schema: ApiSuccessResponseSchema } } 
    },
    400: { 
      description: 'Validation error', 
      content: { 'application/json': { schema: ApiErrorResponseSchema } } 
    },
    401: UnauthorizedResponse,
    403: { 
      description: 'Permesso negato', 
      content: { 'application/json': { schema: ApiErrorResponseSchema } } 
    },
    500: { 
      description: 'Errore server', 
      content: { 'application/json': { schema: ApiErrorResponseSchema } } 
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/analyses/{id}',
  summary: 'Ottieni dettagli analisi',
  tags: ['Analisi'],
  security: [{ ApiKeyAuth: [] }],
  request: { params: AnalysisIdParam },
  responses: {
    200: { 
      description: 'Dati analisi', 
      content: { 'application/json': { schema: AnalysisResponseSchema } } 
    },
    404: NotFoundResponse,
    401: UnauthorizedResponse,
  },
})

// ─────────────────────────────────────────────────────────────
// GENERATOR EXPORT
// ─────────────────────────────────────────────────────────────

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions)
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'GeoBridge API',
      version: '1.0.0',
      description: 'API per analisi dati satellitari Sentinel-2 tramite Copernicus Data Space.',
      contact: { 
        name: 'GeoBridge Support', 
        email: 'support@geobridge.example', 
        url: 'https://geobridge-db.vercel.app' 
      },
    },
    servers: [
      { url: 'https://geobridge-db.vercel.app', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Development' },
    ],
    tags: [{ name: 'Analisi', description: 'Gestione analisi satellitari' }],
  })
}

// Export per uso nei route handler
export { CreateAnalysisRequestSchema, AnalysisResponseSchema }


// 🔍 DEBUG: verifica che .openapi() esista (rimuovi dopo il test)
if (typeof z.string().openapi !== 'function') {
  console.error('❌ FATAL: z.openapi is not a function!')
  console.error('zod version:', require('zod/package.json').version)
  console.error('zod-to-openapi loaded:', require('@asteasolutions/zod-to-openapi') ? 'yes' : 'no')
  throw new Error('Zod OpenAPI extension failed')
}
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>
