// src/lib/api-docs/openapi.ts
// ✅ APPROCCIO STATICO: Compatibile al 100% con Next.js/Turbopack

// Definiamo lo spec come un oggetto costante semplice
export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "GeoBridge API",
    version: "1.0.0",
    description: "API per analisi dati satellitari Sentinel-2.",
    contact: {
      name: "GeoBridge Support",
      email: "support@geobridge.example",
      url: "https://geobridge-db.vercel.app",
    },
  },
  servers: [
    { url: "https://geobridge-db.vercel.app", description: "Production" },
    { url: "http://localhost:3000", description: "Development" },
  ],
  tags: [{ name: "Analisi", description: "Gestione analisi satellitari" }],
  
  // Definizione dei componenti di sicurezza
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API Key per autenticazione.",
      },
    },
    schemas: {
      // Definizione schemi base (semplificata per statico)
      Coordinate: {
        type: "array",
        items: { type: "number" },
        minItems: 2,
        maxItems: 2,
        description: "[lat, lon]"
      },
      AnalysisResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
          area_km2: { type: "number" },
          summary: { type: "string" },
          periods: { 
            type: "array", 
            items: { 
              type: "object", 
              properties: {
                date: { type: "string" },
                ndvi: { type: "number", nullable: true }
              }
            } 
          }
        }
      }
    }
  },

  paths: {
    "/api/v1/analyses": {
      post: {
        tags: ["Analisi"],
        summary: "Crea una nuova analisi satellitare",
        description: "Avvia un'analisi satellitare su un'area definita da poligono.",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "coordinates", "start_date", "end_date"],
                properties: {
                  title: { type: "string", minLength: 1, maxLength: 200, example: "Monitoraggio campo" },
                  coordinates: { 
                    type: "array", 
                    items: { $ref: "#/components/schemas/Coordinate" },
                    minItems: 3,
                    example: [[41.9, 12.5], [41.9, 12.6], [42.0, 12.55]]
                  },
                  start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2024-01-01" },
                  end_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2024-06-30" },
                  address: { type: "string", nullable: true },
                  area_type: { type: "string", enum: ["polygon", "rectangle", "circle"], default: "polygon" },
                  use_mock: { type: "boolean", default: false, description: "Forza dati mock per testing" }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Analisi creata con successo",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                     { $ref: "#/components/schemas/AnalysisResponse" }
                  }
                }
              }
            }
          },
          "400": {
            description: "Errore di validazione",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string", example: "Validation error" },
                    message: { type: "string" }
                  }
                }
              }
            }
          },
          "401": { description: "Non autorizzato" },
          "500": { description: "Errore interno del server" }
        }
      },
      get: {
        tags: ["Analisi"],
        summary: "Lista analisi",
        description: "Restituisce la lista delle analisi per l'utente autenticato.",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
        ],
        responses: {
          "200": { description: "Lista di analisi" },
          "401": { description: "Non autorizzato" }
        }
      }
    },
    "/api/v1/analyses/{id}": {
      get: {
        tags: ["Analisi"],
        summary: "Dettagli analisi",
        security: [{ ApiKeyAuth: [] }],
        parameters: [
          { 
            name: "id", 
            in: "path", 
            required: true, 
            schema: { type: "string", format: "uuid" },
            description: "ID dell'analisi"
          }
        ],
        responses: {
          "200": { 
            description: "Dati analisi",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AnalysisResponse" } } }
          },
          "404": { description: "Non trovato" },
          "401": { description: "Non autorizzato" }
        }
      }
    }
  }
} as const

// ✅ Export della funzione richiesta dalla route (wrapper semplice)
export function generateOpenApiDocument() {
  return openApiSpec
}
