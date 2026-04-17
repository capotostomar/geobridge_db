import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    COPERNICUS_CLIENT_ID: process.env.COPERNICUS_CLIENT_ID ? '✅ SET' : '❌ MISSING',
    COPERNICUS_CLIENT_SECRET: process.env.COPERNICUS_CLIENT_SECRET ? '✅ SET' : '❌ MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ SET' : '❌ MISSING',
    willUseRealData: !!(process.env.COPERNICUS_CLIENT_ID && process.env.COPERNICUS_CLIENT_SECRET),
  })
}
