'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient, isDemoMode } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface DemoUser {
  id: string
  email: string
  user_metadata: {
    full_name?: string
  }
}

interface AuthContextType {
  user: User | DemoUser | null
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Helper to get demo user from localStorage (only on client)
function getDemoUserFromStorage(): DemoUser | null {
  if (typeof window === 'undefined') return null
  try {
    const savedUser = localStorage.getItem('geobridge_demo_user')
    return savedUser ? JSON.parse(savedUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize with demo user from localStorage (lazy initializer)
  const [user, setUser] = useState<User | DemoUser | null>(() => {
    if (isDemoMode()) {
      return getDemoUserFromStorage()
    }
    return null
  })
  const [loading, setLoading] = useState(() => !isDemoMode())
  const router = useRouter()
  
  // Compute isDemo directly - no state needed
  const isDemo = isDemoMode()

  useEffect(() => {
    if (isDemo) {
      // Demo mode - already initialized from localStorage
      return
    }

    // Real Supabase mode
    const supabase = createClient()
    
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [isDemo])

  const signIn = useCallback(async (email: string, password: string) => {
    if (isDemo) {
      // Demo mode - accept any credentials
      const demoUser: DemoUser = {
        id: 'demo-user-' + Date.now(),
        email,
        user_metadata: { full_name: 'Demo User' }
      }
      setUser(demoUser)
      localStorage.setItem('geobridge_demo_user', JSON.stringify(demoUser))
      router.push('/')
      return { error: null }
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      router.push('/')
    }
    return { error }
  }, [isDemo, router])

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    if (isDemo) {
      // Demo mode - create local user
      const demoUser: DemoUser = {
        id: 'demo-user-' + Date.now(),
        email,
        user_metadata: { full_name: fullName || 'New User' }
      }
      setUser(demoUser)
      localStorage.setItem('geobridge_demo_user', JSON.stringify(demoUser))
      return { error: null }
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    })
    return { error }
  }, [isDemo])

  const signOut = useCallback(async () => {
    if (isDemo) {
      localStorage.removeItem('geobridge_demo_user')
      setUser(null)
      router.push('/')
      return
    }

    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }, [isDemo, router])

  return (
    <AuthContext.Provider value={{ user, loading, isDemo, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
