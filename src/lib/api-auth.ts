/**
 * GeoBridge — API Key Auth
 * Usa Supabase come backend (tabella api_keys).
 * Compatibile sia con modalità demo (localStorage) che produzione.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/client'

// ─── Demo mode: API Keys in memoria (nessun DB) ────────────────────────────
// In demo mode salviamo le keys in un Map server-side (dura per tutta la sessione)
const demoKeys = new Map<string, { id: string; name: string; permissions: string; requestCount: number; createdAt: string }>()

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function generateApiKey(name: string, permissions = 'read'): Promise<string> {
  const rawKey = `gb_${crypto.randomUUID().replace(/-/g, '')}_${Date.now().toString(36)}`
  const hashedKey = hashKey(rawKey)

  if (isDemoMode()) {
    demoKeys.set(hashedKey, {
      id: crypto.randomUUID(),
      name,
      permissions,
      requestCount: 0,
      createdAt: new Date().toISOString(),
    })
    return rawKey
  }

  const supabase = await createClient()
  await supabase.from('api_keys').insert({
    key: hashedKey,
    name,
    permissions,
    active: true,
  })

  return rawKey
}

export async function listApiKeys() {
  if (isDemoMode()) {
    return Array.from(demoKeys.entries()).map(([hashed, v]) => ({
      id: v.id,
      name: v.name,
      permissions: v.permissions,
      active: true,
      lastUsedAt: null,
      requestCount: v.requestCount,
      createdAt: v.createdAt,
      keyPreview: `gb_...${hashed.slice(-8)}`,
    }))
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data.map((k: Record<string, unknown>) => ({
    id: k.id,
    name: k.name,
    permissions: k.permissions,
    active: k.active,
    lastUsedAt: k.last_used_at,
    requestCount: k.request_count,
    createdAt: k.created_at,
    keyPreview: `gb_...${(k.key as string).slice(-8)}`,
  }))
}

export async function revokeApiKey(id: string): Promise<void> {
  if (isDemoMode()) {
    for (const [k, v] of demoKeys.entries()) {
      if (v.id === id) { demoKeys.delete(k); break }
    }
    return
  }
  const supabase = await createClient()
  await supabase.from('api_keys').delete().eq('id', id)
}

export async function validateApiKey(req: NextRequest): Promise<{
  valid: boolean; keyName?: string; permissions?: string; error?: string
}> {
  const authHeader = req.headers.get('authorization')
  const queryKey  = new URL(req.url).searchParams.get('api_key')
  const rawKey    = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryKey

  if (!rawKey) {
    return { valid: false, error: 'Missing API key. Use Authorization: Bearer <key> or ?api_key=<key>' }
  }

  const hashedKey = hashKey(rawKey)

  // Demo mode
  if (isDemoMode()) {
    const entry = demoKeys.get(hashedKey)
    if (!entry) return { valid: false, error: 'Invalid API key' }
    entry.requestCount++
    return { valid: true, keyName: entry.name, permissions: entry.permissions }
  }

  // Supabase mode
  try {
    const supabase = await createClient()
    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key', hashedKey)
      .single()

    if (error || !apiKey) return { valid: false, error: 'Invalid API key' }
    if (!apiKey.active)  return { valid: false, error: 'API key is disabled' }

    // Aggiorna stats in background (non blocca la risposta)
    supabase.from('api_keys').update({
      last_used_at:  new Date().toISOString(),
      request_count: (apiKey.request_count ?? 0) + 1,
    }).eq('id', apiKey.id).then(() => {})

    return { valid: true, keyName: apiKey.name, permissions: apiKey.permissions }
  } catch {
    return { valid: false, error: 'Internal error validating API key' }
  }
}

export function unauthorizedResponse(error: string) {
  return NextResponse.json({ error: 'Unauthorized', message: error }, { status: 401 })
}

export function forbiddenResponse(message: string) {
  return NextResponse.json({ error: 'Forbidden', message }, { status: 403 })
}
