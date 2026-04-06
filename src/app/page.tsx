'use client'

import { useAuth } from '@/lib/auth-context'
import { LoginPage } from '@/components/auth/login-page'
import { AppShell } from '@/components/shell/app-shell'
import { Loader2 } from 'lucide-react'

export default function Home() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060d17] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#2dd4bf] mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-mono tracking-wider">LOADING GEOBRIDGE</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <AppShell />
}
