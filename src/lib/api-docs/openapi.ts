// src/lib/api-docs/openapi.ts
// ✅ SPEC OPENAPI STATICO + SCHEMI PER VALIDAZIONE

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// SCHEMI ZOD PER VALIDAZIONE (usati nei route handler)
// ─────────────────────────────────────────────────────────────

export const CoordinateSchema = z
  .tuple([
    z.number().min(-90).max(90),
    z.number().min(-180).max(180),
  ])

export const PolygonSchema = z.array(CoordinateSchema).min(3)

export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const CreateAnalysisRequestSchema = z.object({
  title: z.string().min(1).max(200),
  coordinates: PolygonSchema,
  start_date: DateStringSchema,
  end_date: DateStringSchema,
  address: z.string().optional(),
  area_type: z.enum(['polygon', 'rectangle', 'circle']).optional().default('polygon'),
  analysis_mode: z.enum(['timeseries', 'single_date']).optional().default('timeseries'),
  use_mock: z.boolean().optional().default(false),
})

export const AnalysisResponseSchema = z.object({
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
    ndwi: z.number().nullable(),
  })),
  indices: z.array(z.string()),
  categories: z.array(z.string()),
  recommendations: z.array(z.string()),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
})

export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>

// ─────────────────────────────────────────────────────────────
// SPEC OPENAPI STATICO (per Swagger UI)
// ─────────────────────────────────────────────────────────────

export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "GeoBridge API",
    version: "1.0.0",
    description: "API per analisi dati satellitari Sentinel-2.",
    contact: { name: "GeoBridge", email: "support@geobridge.example", url: "https://geobridge-db.vercel.app" },
  },
  servers: [
    { url: "https://geobridge-db.vercel.app", description: "Production" },
    { url: "http://localhost:3000", description: "Development" },
  ],
  tags: [{ name: "Analisi", description: "Gestione analisi satellitari" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "API Key per autenticazione" },
    },
    schemas: {
      Coordinate: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "[lat, lon]" },
      AnalysisResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
          area_km2: { type: "number" },
          summary: { type: "string" },
          periods: { type: "array", items: { type: "object", properties: { date: { type: "string" }, ndvi: { type: "number", nullable: true } } } },
        },
      },
    },
  },
  paths: {
    "/api/v1/analyses": {
      post: {
        tags: ["Analisi"],
        summary: "Crea una nuova analisi satellitare",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "coordinates", "start_date", "end_date"],
                properties: {
                  title: { type: "string", minLength: 1, example: "Monitoraggio campo" },
                  coordinates: { type: "array", items: { $ref: "#/components/schemas/Coordinate" }, minItems: 3, example: [[41.9, 12.5], [41.9, 12.6], [42.0, 12.55]] },
                  start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2024-01-01" },
                  end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2024-06-30" },
                  address: { type: "string", nullable: true },
                  area_type: { type: "string", enum: ["polygon", "rectangle", "circle"], default: "polygon" },
                  use_mock: { type: "boolean", default: false },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Analisi creata", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/AnalysisResponse" } } } } } },
          "400": { description: "Errore validazione" },
          "401": { description: "Non autorizzato" },
          "500": { description: "Errore server" },
        },
      },
      get: {
        tags: ["Analisi"],
        summary: "Lista analisi",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "Lista analisi" }, "401": { description: "Non autorizzato" } },
      },
    },
    "/api/v1/analyses/{id}": {
      get: {
        tags: ["Analisi"],
        summary: "Dettagli analisi",
        security: [{ ApiKeyAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Dati analisi", content: { "application/json": { schema: { $ref: "#/components/schemas/AnalysisResponse" } } } },
          "404": { description: "Non trovato" },
          "401": { description: "Non autorizzato" },
        },
      },
    },
  },
} as const

// ✅ Funzione wrapper richiesta dalle route
export function generateOpenApiDocument() {
  return openApiSpec
}
