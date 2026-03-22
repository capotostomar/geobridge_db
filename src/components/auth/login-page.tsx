'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { Loader2, Info } from 'lucide-react'

export function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, isDemo } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await signIn(email, password)
        if (error) setError(error.message)
      } else {
        const { error } = await signUp(email, password, fullName)
        if (error) setError(error.message)
        else setError('Controlla la tua email per confermare la registrazione')
      }
    } catch (err) {
      setError('Si è verificato un errore')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[url('/logo.jpeg')] bg-center bg-cover opacity-5" />
      
      <div className="w-full max-w-md relative">
        {/* Logo Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg mb-4 bg-white/10 p-2">
              <Image
                src="/logo.jpeg"
                alt="GeoBridge Logo"
                width={80}
                height={80}
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">GeoBridge</h1>
            <p className="text-slate-400 mt-1 text-sm">Analisi Satellitare per Valutazione Rischio</p>
          </div>

          {/* Demo Mode Banner */}
          {isDemo && (
            <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-amber-400 font-medium">Modalità Demo</p>
                <p className="text-xs text-amber-400/80 mt-0.5">
                  Configura Supabase per la piena funzionalità. Usa qualsiasi email/password per provare.
                </p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                isLogin 
                  ? 'bg-white text-slate-900 shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Accedi
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                !isLogin 
                  ? 'bg-white text-slate-900 shadow-lg' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Registrati
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-300">Nome completo</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Mario Rossi"
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isDemo ? "demo@geobridge.it" : "nome@esempio.com"}
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-emerald-500"
              />
            </div>

            {error && (
              <div className={`text-sm p-3 rounded-lg ${
                error.includes('Controlla') 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                'Accedi'
              ) : (
                'Crea Account'
              )}
            </Button>
          </form>

          {/* Demo hint */}
          {isDemo && isLogin && (
            <div className="mt-6 pt-4 border-t border-white/10">
              <p className="text-xs text-slate-500 text-center">
                💡 Modalità demo: inserisci qualsiasi email e password per entrare
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-6">
          Powered by Sentinel-2 Satellite Data
        </p>
      </div>
    </div>
  )
}
