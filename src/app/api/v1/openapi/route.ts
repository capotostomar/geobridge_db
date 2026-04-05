import { NextResponse } from 'next/server'
import { getOpenApiSpec } from '@/lib/openapi/spec'

// GET /api/v1/openapi — serve OpenAPI 3.0 spec
export async function GET() {
  return NextResponse.json(getOpenApiSpec())
}
