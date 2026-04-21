// src/app/api/docs/openapi.json/route.ts
import { NextResponse } from 'next/server'
import { generateOpenApiDocument } from '@/lib/api-docs/openapi'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export async function GET() {
  const spec = generateOpenApiDocument()
  return NextResponse.json(spec, {
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    },
  })
}
