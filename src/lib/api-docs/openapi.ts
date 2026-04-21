// src/lib/api-docs/openapi.ts
// ✅ Versione compatibile con Next.js e Turbopack (senza errori di estensione)

import { z as zod } from 'zod'
import { 
  extendZodWithOpenApi, 
  OpenAPIRegistry, 
  OpenApiGeneratorV3 
} from '@asteasolutions/zod-to-openapi'

// 🛡️ FIX: Inizializza l'estensione Zod UNA volta usando globalThis
// Non modifichiamo l'oggetto 'zod' importato (che è bloccato da Next.js)
if (!globalThis.zodExtensionDone) {
  extendZodWithOpenApi(zod)
  globalThis.zodExtensionDone = true
}

// Alias locale per comodità
const z = zod

// 1️⃣ Registry centrale
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
        properties: { error: { type: 'string' }, message: { type: 'string' } } 
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
        properties: { error: { type: 'string' }, message: { type: 'string' } } 
      } 
    } 
  },
} as const

// ─────────────────────────────────────────────────────────────
// SCHEMAS (Nota: usiamo .openapi() ora che l'estensione è attiva)
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
    address: z.string().optional().openapi({ description: 'Indirizzo area' }),
    area_type: z.enum(['polygon', 'rectangle', 'circle']).optional().openapi({ default: 'polygon' }),
    analysis_mode: z.enum(['timeseries', 'single_date']).optional().openapi({ default: 'timeseries' }),
    use_mock: z.boolean().optional().openapi({ description: 'Forza dati mock', default: false }),
  })
  .openapi({ ref: 'CreateAnalysisRequest' })

export const AnalysisResponseSchema = z
  .object({
    id: z.string().uuid(),
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
  .object({ success: z.literal(true), data: AnalysisResponseSchema })
  .openapi({ ref: 'ApiSuccessResponse' })

const ApiErrorResponseSchema = z
  .object({ error: z.string(), message: z.string(), details: z.record(z.unknown()).optional() })
  .openapi({ ref: 'ApiErrorResponse' })

// ─────────────────────────────────────────────────────────────
// REGISTRAZIONE ENDPOINT
// ─────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post',
  path: '/api/v1/analyses',
  summary: 'Crea una nuova analisi satellitare',
  tags: ['Analisi'],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: CreateAnalysisRequestSchema } } },
  },
  responses: {
    201: { description: 'Creata', content: { 'application/json': { schema: ApiSuccessResponseSchema } } },
    400: { description: 'Errore validazione', content: { 'application/json': { schema: ApiErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: { description: 'Errore server', content: { 'application/json': { schema: ApiErrorResponseSchema } } },
  },
})

//
