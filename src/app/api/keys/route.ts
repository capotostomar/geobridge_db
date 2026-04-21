// src/app/api/keys/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { generateApiKey, listApiKeys, revokeApiKey } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

// GET /api/keys — lista tutte le API keys dell'utente loggato
export async function GET() {
  try {
    // ✅ Ottieni l'utente loggato per filtrare le sue key
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    const keys = await listApiKeys(user?.id)  // ✅ Passa userId per filtrare
    return NextResponse.json(keys)
  } catch (error) {
    console.error('GET /api/keys error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/keys — genera una nuova API key ASSOCIATA all'utente loggato
export async function POST(req: NextRequest) {
  try {
    // ✅ 1. Ottieni l'utente loggato dalla sessione Supabase
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Devi essere loggato per creare una API key' },
        { status: 401 }
      )
    }

    // ✅ 2. Parsing del body
    const { name, permissions } = await req.json()
    if (!name || typeof name !== 'string')
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const perms = permissions === 'write' ? 'write' : 'read'

    // ✅ 3. Genera la key PASSANDO user.id
    const rawKey = await generateApiKey(name, perms, user.id)

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

// DELETE /api/keys?id=xxx — revoca una API key (solo se è dell'utente)
export async function DELETE(req: NextRequest) {
  try {
    // ✅ Verifica che l'utente sia loggato
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // ✅ Revoca solo se la key appartiene all'utente
    await revokeApiKey(id, user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/keys error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
