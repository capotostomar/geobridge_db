import { createBrowserClient } from '@supabase/ssr'

// Demo mode fallback - allows app to run without Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://demo.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'demo-key'

export function createClient() {
  return createBrowserClient(
    supabaseUrl,
    supabaseKey
  )
}

export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || 
         process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://demo.supabase.co'
}
