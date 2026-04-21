'use client'

import { useState, useEffect } from 'react'
import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/docs/openapi.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load OpenAPI spec')
        return res.json()
      })
      .then(setSpec)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">❌ Errore caricamento documentazione</h1>
        <pre className="bg-red-50 p-4 rounded text-red-700">{error}</pre>
        <p className="mt-4">
          Assicurati che l'endpoint <code>/api/docs/openapi.json</code> sia raggiungibile.
        </p>
      </div>
    )
  }

  if (!spec) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">Caricamento documentazione API...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-semibold">🛰️ GeoBridge API Documentation</h1>
          <p className="text-sm text-gray-600 mt-1">
            Versione {spec.info.version} •{' '}
            <a href="/api/docs/openapi.json" className="text-blue-600 hover:underline" target="_blank">
              Download OpenAPI JSON
            </a>
          </p>
        </div>
      </header>
      
      <main>
        <SwaggerUI 
          spec={spec}
          defaultModelsExpandDepth={1}
          defaultModelExpandDepth={1}
          displayRequestDuration={true}
          filter={true}
        />
      </main>
    </div>
  )
}
