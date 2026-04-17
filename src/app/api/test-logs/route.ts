import { NextResponse } from 'next/server'

export async function GET() {
  const logs = []
  
  logs.push('[TEST] Inizio test')
  logs.push(`[TEST] COPERNICUS_CLIENT_ID: ${process.env.COPERNICUS_CLIENT_ID ? '✅' : '❌'}`)
  logs.push(`[TEST] COPERNICUS_CLIENT_SECRET: ${process.env.COPERNICUS_CLIENT_SECRET ? '✅' : '❌'}`)
  
  // Simula una chiamata
  const { isCopernicusConfigured } = await import('@/lib/copernicus/sentinel-client')
  logs.push(`[TEST] isCopernicusConfigured(): ${isCopernicusConfigured()}`)
  
  return NextResponse.json({ logs, timestamp: new Date().toISOString() })
}
