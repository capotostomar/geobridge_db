import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

// Registry centrale per componenti OpenAPI riutilizzabili
export const registry = new OpenAPIRegistry()

// ─────────────────────────────────────────────────────────────
// SECURITY SCHEMES
// ─────────────────────────────────────────────────────────────

registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-API-Key',
  description: 'API Key per autenticazione. Contattaci per ottenerne una.',
})

// ─────────────────────────────────────────────────────────────
// PARAMETRI COMUNI
// ─────────────────────────────────────────────────────────────

export const AnalysisIdParam = registry.registerParameter(
  'AnalysisIdParam',
  {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'ID univoco dell\'analisi (UUID v4)',
    example: 'cce2cdbb-0bd9-46b6-a06f-8b9b2155b526',
  } as const
)

export const FormatQueryParam = registry.registerParameter(
  'FormatQueryParam',
  {
    name: 'format',
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['json', 'csv', 'geojson'], default: 'json' },
    description: 'Formato di esportazione dei dati',
  } as const
)

// ─────────────────────────────────────────────────────────────
// RESPONSE COMMON
// ─────────────────────────────────────────────────────────────

export const NotFoundResponse = {
  description: 'Risorsa non trovata',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Not Found' },
          message: { type: 'string', example: 'Analysis not found' },
        },
      },
    },
  },
} as const

export const UnauthorizedResponse = {
  description: 'Autenticazione fallita',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
          message: { type: 'string', example: 'Invalid or missing API key' },
        },
      },
    },
  },
} as const