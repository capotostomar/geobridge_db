/**
 * GeoBridge — API Key Auth
 * Usa Supabase come backend (tabella api_keys).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/supabase/client'

// Tipi per le chiavi demo
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

// ✅ generateApiKey: accetta userId e lo salva nel DB
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
  
  // ✅ Inserisce la chiave con user_id se fornito
  const { error } = await supabase.from('api_keys').insert({
    key: hashedKey,
    name,
    permissions,
    active: true,
    user_id: userId, // <-- Qui viene salvato l'user_id
  })
  
  if (error) throw error
  return rawKey
}

// ✅ listApiKeys: accetta userId opzionale e filtra se presente
export async function listApiKeys(userId?: string) {
  if (isDemoMode()) {
    let entries = Array.from(demoKeys.entries())
    
    // Filtra demo keys se userId è fornito
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
  
  // ✅ Applica filtro per user_id se fornito
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
    createdAt: k
