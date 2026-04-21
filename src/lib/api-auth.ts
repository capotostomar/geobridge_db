/**
 * GeoBridge — API Key Auth
 * Usa Supabase come backend (tabella api_keys).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/client'

type DemoKeyEntry = {
  id: string
  name: string
  permissions: string
  userId: string
  requestCount: number
  createdAt: string
}

const demoKeys = new Map<string, DemoKeyEntry>()

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function generateApiKey(name: string, permissions = 'read', userId?: string): Promise<string> {
  const rawKey = `gb_${crypto.randomUUID().replace(/-/g, '')}_${Date.now().toString(36)}`
  const hashedKey = hashKey(rawKey)

  if (isDemoMode()) {
    demoKeys.set(hashedKey, {
      id: crypto.randomUUID(),
      name,
      permissions,
      userId: userId ?? 'demo',
      requestCount: 0,
      createdAt: new Date().toISOString(),
    })
    return rawKey
  }

  const supabase = await createClient()
  const { error } = await supabase.from('api_keys').insert({
    key: hashedKey,
    name,
    permissions,
    active: true,
    user_id: userId,
  })
  if (error) throw error
  return rawKey
}

export async function listApiKeys(userId?: string) {
  if (isDemoMode()) {
    let entries = Array.from(demoKeys.entries())
    if (userId) {
      entries = entries.filter(([_, v]) => v.userId === userId)
    }
    return entries.map(([hashed, v]) => ({
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
  let query = supabase.from('api_keys').select('*')
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error || !data) return []
  
  return data.map((k: Record<string, unknown>) => ({
    id: k.id as string,
    name: k.name as string,
    permissions: k.permissions as string,
    active: k.active as boolean,
    lastUsedAt: k.last_used_at as string | null,
    requestCount: (k.request_count as number) ?? 0,
    createdAt: k.created_at as string,
    keyPreview: `gb_...${(k.key as string).slice(-8)}`,
  }))
}

export async function revokeApiKey(id: string, userId?: string): Promise<void> {
  if (isDemoMode()) {
    for (const [k, v] of demoKeys.entries()) {
      if (v.id === id) {
        if (!userId || v.userId === userId) {
          demoKeys.delete(k)
          break
        }
      }
    }
    return
  }

  const supabase = await createClient()
  let query = supabase.from('api_keys').delete().eq('id', id)
  if (userId) {
    query = query.eq('user_id', userId)
  }
  await query
}

export async function validateApiKey(req: NextRequest): Promise<{
  valid: boolean
  keyName?: string
  permissions?: string
  userId?: string
  error?: string
}> {
  const authHeader = req.headers.get('authorization')
  const queryKey = new URL(req.url).searchParams.get('api_key')
  const rawKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryKey

  if (!rawKey) return { valid: false, error: 'Missing API key' }

  const hashedKey = hashKey(rawKey)

  if (isDemoMode()) {
    const entry = demoKeys.get(hashedKey)
    if (!entry) return { valid: false, error: 'Invalid API key' }
    entry.requestCount++
    return { valid: true, keyName: entry.name, permissions: entry.permissions, userId: entry.userId }
  }

  try {
    const supabase = await createClient()
    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key', hashedKey)
      .single()
      
    if (error || !apiKey) return { valid: false, error: 'Invalid API key' }
    if (!(apiKey as any).active) return { valid: false, error: 'API key is disabled' }

    // Update usage stats in background
    supabase
      .from('api_keys')
      .update({
        last_used_at: new Date().toISOString(),
        request_count: ((apiKey as any).request_count ?? 0) + 1,
      })
      .eq('id', (apiKey as any).id)
      .then()
      .catch(() => {})

    return {
      valid: true,
      keyName: (apiKey as any).name,
      permissions: (apiKey as any).permissions,
      userId: (apiKey as any).user_id,
    }
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
