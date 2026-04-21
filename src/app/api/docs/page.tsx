// src/app/api/docs/page.tsx
'use client'
import { useState, useEffect } from 'react'
import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<any>(null)

  useEffect(() => {
    fetch('/api/docs/openapi.json')
      .then(res => res.json())
      .then(setSpec)
      .catch(console.error)
  }, [])

  if (!spec) return <div className="p-8">Caricamento documentazione API...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-semibold">🛰️ GeoBridge API Docs</h1>
        <p className="text-sm text-gray-600">v{spec.info.version}</p>
      </header>
      <SwaggerUI spec={spec} defaultModelsExpandDepth={1} displayRequestDuration filter />
    </div>
  )
}
