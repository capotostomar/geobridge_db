'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Key, Plus, Trash2, Copy, Check, AlertTriangle,
  Shield, Loader2, Terminal, ChevronDown, ChevronUp
} from 'lucide-react'
import { toast } from 'sonner'

interface ApiKeyInfo {
  id: string
  name: string
  permissions: string
  active: boolean
  lastUsedAt: string | null
  requestCount: number
  createdAt: string
  keyPreview: string
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${value ? 'left-5' : 'left-0.5'}`} />
    </button>
  )
}

/* ─── Sezione accordion interna ────────────────────────────────────────── */
function Section({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

export function ApiKeysPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyPerms, setNewKeyPerms] = useState<'read' | 'write'>('read')
  const [generatedKey, setGeneratedKey] = useState('')
  const [showGenerated, setShowGenerated] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState('')
  const [testLoading, setTestLoading] = useState(false)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/keys')
      if (res.ok) setApiKeys(await res.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadKeys() }, [loadKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), permissions: newKeyPerms }),
      })
      if (res.ok) {
        const data = await res.json()
        setGeneratedKey(data.key)
        setShowGenerated(true)
        setNewKeyName('')
        loadKeys()
        toast.success('API Key creata!')
      } else toast.error('Errore nella creazione')
    } catch { toast.error('Errore di connessione') }
    finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
      setApiKeys(prev => prev.filter(k => k.id !== id))
      toast('Key eliminata')
    } catch { toast.error('Errore') }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleTestApi = async () => {
    setTestLoading(true)
    setTestResult('')
    try {
      const key = apiKeys.find(k => k.active)
      if (!key) { setTestResult('⚠️ Nessuna API Key attiva. Creane una.'); return }
      // Il test usa la preview — in produzione mostrare come usare la key vera
      const res = await fetch('/api/v1/indices/41.90/12.50?date=2024-06-15', {
        headers: { Authorization: `Bearer ${key.keyPreview}` },
      })
      const data = await res.json()
      setTestResult(JSON.stringify(data, null, 2))
    } catch (err: unknown) {
      setTestResult(`Errore: ${err instanceof Error ? err.message : 'sconosciuto'}`)
    }
    finally { setTestLoading(false) }
  }

  return (
    <div>
      {/* Key list */}
      <Section title={`API Keys ${apiKeys.length > 0 ? `(${apiKeys.length})` : ''}`} defaultOpen>
        <div className="px-5 pb-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /></div>
          ) : apiKeys.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs">
              <Key className="w-7 h-7 mx-auto mb-2 opacity-20" />
              Nessuna API Key — creane una qui sotto
            </div>
          ) : (
            apiKeys.map(k => (
              <div key={k.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Key className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-800">{k.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${k.permissions === 'write' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                      {k.permissions}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${k.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {k.active ? 'attiva' : 'disattiva'}
                    </span>
                  </div>
                  <code className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded mt-1 inline-block">{k.keyPreview}</code>
                  <div className="text-[10px] text-slate-400 mt-0.5">{k.requestCount} richieste</div>
                </div>
                <button onClick={() => handleDelete(k.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}

          {/* Create form */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nuova API Key</p>
            <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
              placeholder="Nome chiave (es. Produzione)"
              className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs outline-none focus:border-emerald-400 transition-all" />
            <div className="flex gap-2">
              <select value={newKeyPerms} onChange={e => setNewKeyPerms(e.target.value as 'read' | 'write')}
                className="flex-1 h-8 border border-slate-200 rounded-lg px-2 text-xs outline-none focus:border-emerald-400 bg-white">
                <option value="read">Read (sola lettura)</option>
                <option value="write">Write (lettura + scrittura)</option>
              </select>
              <button onClick={handleCreate} disabled={creating || !newKeyName.trim()}
                className="h-8 px-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors">
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Crea
              </button>
            </div>
          </div>

          {/* Generated key alert */}
          {showGenerated && generatedKey && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs font-semibold text-amber-800">Salva questa chiave ora! Non sarà più visibile.</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-900 text-emerald-400 rounded-lg px-2.5 py-2 text-[10px] font-mono break-all">{generatedKey}</code>
                <button onClick={() => copyToClipboard(generatedKey, 'generated')}
                  className="w-8 h-8 border border-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-50 flex-shrink-0">
                  {copiedId === 'generated' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                </button>
              </div>
              <button onClick={() => { setShowGenerated(false); setGeneratedKey('') }}
                className="w-full h-7 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-colors">
                Ho salvato la chiave
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* API Docs quick ref */}
      <Section title="Endpoint API v1">
        <div className="px-5 pb-3 space-y-2">
          {[
            { method: 'POST', path: '/api/v1/analyses', perms: 'write', desc: 'Crea analisi da coordinate' },
            { method: 'GET', path: '/api/v1/analyses/{id}', perms: 'read', desc: 'Recupera risultati analisi' },
            { method: 'GET', path: '/api/v1/indices/{lat}/{lon}', perms: 'read', desc: 'Indici spettrali puntuale' },
          ].map(ep => (
            <div key={ep.path} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-xl">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5 ${ep.method === 'POST' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>
                {ep.method}
              </span>
              <div className="flex-1 min-w-0">
                <code className="text-[10px] text-slate-700 font-mono">{ep.path}</code>
                <p className="text-[10px] text-slate-500 mt-0.5">{ep.desc}</p>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${ep.perms === 'write' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                {ep.perms}
              </span>
            </div>
          ))}

          {/* Curl examples */}
          <div className="mt-2 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 mb-1.5">1. Crea un'analisi (→ ottieni l'ID)</p>
            <pre className="bg-slate-900 text-emerald-400 rounded-xl p-3 text-[9px] font-mono overflow-x-auto leading-relaxed">{`curl -X POST '/api/v1/analyses' \\
  -H 'Authorization: Bearer gb_...' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "title": "Parco Nord Milano",
    "coordinates": [[45.52,9.18],[45.52,9.22],[45.50,9.22],[45.50,9.18]],
    "start_date": "2022-01-01",
    "end_date": "2024-12-31"
  }'
# → Risposta: { "data": { "id": "clxxx..." } }`}</pre>

            <p className="text-[10px] font-semibold text-slate-500 mb-1.5 mt-3">2. Recupera l'analisi per ID</p>
            <pre className="bg-slate-900 text-emerald-400 rounded-xl p-3 text-[9px] font-mono overflow-x-auto leading-relaxed">{`curl -X GET '/api/v1/analyses/clxxx...' \\
  -H 'Authorization: Bearer gb_...'
# Usa l'ID restituito dal POST sopra`}</pre>

            <p className="text-[10px] font-semibold text-slate-500 mb-1.5 mt-3">3. Indici puntuale (no analisi necessaria)</p>
            <pre className="bg-slate-900 text-emerald-400 rounded-xl p-3 text-[9px] font-mono overflow-x-auto leading-relaxed">{`curl '/api/v1/indices/41.90/12.50?date=2024-06-15' \\
  -H 'Authorization: Bearer gb_...'`}</pre>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-[9px] text-amber-700 leading-relaxed">
                ⚠️ <strong>Nota:</strong> l'ID analisi si ottiene dalla risposta del POST <code className="bg-amber-100 px-1 rounded">/api/v1/analyses</code>. Non è l'ID visibile nell'URL dell'app (quello usa un formato diverso in modalità demo).
              </p>
            </div>
          </div>

          {/* Quick test */}
          <div className="pt-2 border-t border-slate-100">
            <button onClick={handleTestApi} disabled={testLoading}
              className="w-full h-8 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors">
              {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
              Test GET /api/v1/indices/41.90/12.50
            </button>
            {testResult && (
              <pre className="mt-2 bg-slate-900 text-slate-300 rounded-xl p-2.5 text-[9px] font-mono overflow-x-auto max-h-40 leading-relaxed">{testResult}</pre>
            )}
          </div>
        </div>
      </Section>

      {/* Auth info */}
      <Section title="Autenticazione">
        <div className="px-5 pb-3 space-y-2">
          <div className="flex items-start gap-2 p-2.5 bg-emerald-50 rounded-xl">
            <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 leading-relaxed">
              Passa la chiave via header <code className="bg-emerald-100 px-1 rounded">Authorization: Bearer &lt;key&gt;</code> oppure query param <code className="bg-emerald-100 px-1 rounded">?api_key=&lt;key&gt;</code>
            </p>
          </div>
        </div>
      </Section>
    </div>
  )
}
