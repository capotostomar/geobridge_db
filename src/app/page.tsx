'use client'

import { useAuth } from '@/lib/auth-context'
import { LoginPage } from '@/components/auth/login-page'
import { DashboardPage } from '@/components/dashboard/dashboard-page'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const { user, loading } = useAuth()

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-slate-400">Caricamento GeoBridge...</p>
        </div>
      </div>
    )
  }

  // Not authenticated - show login
  if (!user) {
    return <LoginPage />
  }

  // Authenticated - show dashboard
  return <DashboardPage />
}
