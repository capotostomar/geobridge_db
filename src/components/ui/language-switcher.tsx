'use client'

import { useTransition } from 'react'

const LOCALES = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'it', label: 'IT', flag: '🇮🇹' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
]

function getLocaleFromCookie(): string {
  if (typeof document === 'undefined') return 'en'
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/)
  return match ? match[1] : 'en'
}

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const [, startTransition] = useTransition()
  const current = getLocaleFromCookie()

  const switchLocale = (locale: string) => {
    startTransition(() => {
      document.cookie = `locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}`
      window.location.reload()
    })
  }

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {LOCALES.map(l => (
          <button
            key={l.code}
            onClick={() => switchLocale(l.code)}
            title={l.label}
            className={`w-7 h-6 rounded text-[10px] font-bold transition-all ${
              current === l.code
                ? 'bg-emerald-500 text-white'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
      {LOCALES.map(l => (
        <button
          key={l.code}
          onClick={() => switchLocale(l.code)}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
            current === l.code
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>{l.flag}</span>
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  )
}
