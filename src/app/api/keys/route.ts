import { NextRequest, NextResponse } from 'next/server'
import { generateApiKey, listApiKeys, revokeApiKey } from '@/lib/api-auth'

// GET /api/keys — lista tutte le API keys
export async function GET() {
  try {
    const keys = await listApiKeys()
    return NextResponse.json(keys)
  } catch (error) {
    console.error('GET /api/keys error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/keys — genera una nuova API key
export async function POST(req: NextRequest) {
  try {
    const { name, permissions } = await req.json()
    if (!name || typeof name !== 'string')
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const perms = permissions === 'write' ? 'write' : 'read'
    const rawKey = await generateApiKey(name, perms)

    return NextResponse.json({
      success: true,
      key: rawKey,
      name,
      permissions: perms,
      message: 'Save this key now — it cannot be shown again!',
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/keys error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/keys?id=xxx — revoca una API key
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await revokeApiKey(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/keys error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
