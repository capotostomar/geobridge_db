'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Key, Plus, Trash2, Copy, Check, AlertTriangle,
  Shield, Loader2, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

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
  const t = useTranslations('apikeys')

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
        toast.success(t('keyCreated'))
      } else toast.error(t('keyCreateError'))
    } catch { toast.error(t('connectionError')) }
    finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
      setApiKeys(prev => prev.filter(k => k.id !== id))
      toast(t('keyDeleted'))
    } catch { toast.error(t('keyDeleteError')) }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
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
              {t('noKeys')}
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
                      {k.active ? t('active') : t('inactive')}
                    </span>
                  </div>
                  <code className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded mt-1 inline-block">{k.keyPreview}</code>
                  <div className="text-[10px] text-slate-400 mt-0.5">{k.requestCount} {t('requests')}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => copyToClipboard(k.keyPreview, k.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors">
                    {copiedId === k.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                  <button onClick={() => handleDelete(k.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Create form */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('newKey')}</p>
            <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
              placeholder={t('keyNamePlaceholder')}
              className="w-full h-8 border border-slate-200 rounded-lg px-2.5 text-xs outline-none focus:border-emerald-400 transition-all" />
            <div className="flex gap-2">
              <select value={newKeyPerms} onChange={e => setNewKeyPerms(e.target.value as 'read' | 'write')}
                className="flex-1 h-8 border border-slate-200 rounded-lg px-2 text-xs outline-none focus:border-emerald-400 bg-white">
                <option value="read">{t('permRead')}</option>
                <option value="write">{t('permWrite')}</option>
              </select>
              <button onClick={handleCreate} disabled={creating || !newKeyName.trim()}
                className="h-8 px-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors">
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {t('create')}
              </button>
            </div>
          </div>

          {/* Generated key alert */}
          {showGenerated && generatedKey && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs font-semibold text-amber-800">{t('saveKeyWarning')}</p>
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
                {t('keySaved')}
              </button>
            </div>
          )}
        </div>
      </Section>

      {/* API Documentation — Swagger link */}
      <Section title={t('docsTitle')} defaultOpen>
        <div className="px-5 pb-4 space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed">{t('docsDescription')}</p>
          <a
            href="https://geobridge-db.vercel.app/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full p-3.5 bg-gradient-to-r from-emerald-50 to-sky-50 border border-emerald-200 rounded-xl hover:border-emerald-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Swagger UI</p>
                <p className="text-[10px] text-slate-500">geobridge-db.vercel.app/api/docs</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
          </a>
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                {t('authHint')} <code className="bg-slate-200 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>
              </p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
