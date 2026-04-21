import { z } from 'zod'
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'

// Estendi Zod con metodi OpenAPI
extendZodWithOpenApi(z)

// ─────────────────────────────────────────────────────────────
// SCHEMI BASE
// ─────────────────────────────────────────────────────────────

export const CoordinateSchema = z
  .tuple([
    z.number().min(-90).max(90).describe('Latitudine (-90 a +90)'),
    z.number().min(-180).max(180).describe('Longitudine (-180 a +180)'),
  ])
  .openapi('Coordinate')

export const PolygonSchema = z
  .array(CoordinateSchema)
  .min(3)
  .describe('Poligono definito da almeno 3 coordinate [lat, lon]')
  .openapi('Polygon')

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato: YYYY-MM-DD')
  .describe('Data in formato ISO 8601 (solo data)')
  .openapi('DateString')

// ─────────────────────────────────────────────────────────────
// REQUEST/RESPONSE SCHEMAS
// ─────────────────────────────────────────────────────────────

export const CreateAnalysisRequestSchema = z
  .object({
    title: z.string().min(1).max(200).openapi({
      description: 'Titolo dell\'analisi',
      example: 'Monitoraggio campo agricolo - Puglia',
    }),
    coordinates: PolygonSchema.openapi({
      description: 'Coordinate del poligono di interesse',
      example: [[41.9, 12.5], [41.9, 12.6], [42.0, 12.55]],
    }),
    start_date: DateStringSchema.openapi({
      description: 'Data inizio periodo di analisi',
      example: '2024-01-01',
    }),
    end_date: DateStringSchema.openapi({
      description: 'Data fine periodo di analisi',
      example: '2024-06-30',
    }),
    address: z.string().optional().openapi({
      description: 'Indirizzo o descrizione testuale dell\'area',
      example: 'Contrada San Marco, Foggia',
    }),
    area_type: z.enum(['polygon', 'rectangle', 'circle']).optional().openapi({
      description: 'Tipo di area disegnata',
      default: 'polygon',
    }),
    analysis_mode: z.enum(['timeseries', 'single_date']).optional().openapi({
      description: 'Modalità di analisi',
      default: 'timeseries',
    }),
  })
  .openapi('CreateAnalysisRequest')

export const AnalysisResponseSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: 'ID univoco dell\'analisi',
      example: 'cce2cdbb-0bd9-46b6-a06f-8b9b2155b526',
    }),
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
    periods: z.array(
      z.object({
        date: z.string(),
        ndvi: z.number().nullable(),
        ndwi: z.number().nullable(),
        // Aggiungi altri indici...
      })
    ),
    indices: z.array(z.string()),
    categories: z.array(z.string()),
    recommendations: z.array(z.string()),
    created_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable(),
  })
  .openapi('AnalysisResponse')

export const ApiSuccessResponseSchema = z
  .object({
    success: z.literal(true),
     AnalysisResponseSchema,
  })
  .openapi('ApiSuccessResponse')

export const ApiErrorResponseSchema = z
  .object({
    success: z.literal(false).optional(),
    error: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  })
  .openapi('ApiErrorResponse')

// ─────────────────────────────────────────────────────────────
// EXPORT PER UTILIZZO NEI ROUTE HANDLER
// ─────────────────────────────────────────────────────────────

export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>