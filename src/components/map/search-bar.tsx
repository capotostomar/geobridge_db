'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, MapPin, X, Loader2, Navigation } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface SearchResult {
  display_name: string
  lat: string
  lon: string
  type?: string
}

interface SearchBarProps {
  onSearchSelect: (lat: number, lon: number, address: string) => void
  onCoordClick?: () => void
  className?: string
}

export function SearchBar({ onSearchSelect, onCoordClick, className = '' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  // Mobile: collapsed by default, expands on tap
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('searchBar')

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 3) { setResults([]); return }
      setLoading(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
        )
        const data = await res.json()
        setResults(data)
        setIsOpen(true)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ESC closes mobile overlay
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobileExpanded(false); setIsOpen(false) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const handleSelect = (result: SearchResult) => {
    setQuery(result.display_name.split(',').slice(0, 2).join(','))
    setIsOpen(false)
    setMobileExpanded(false)
    onSearchSelect(parseFloat(result.lat), parseFloat(result.lon), result.display_name)
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }

  const openMobile = () => {
    setMobileExpanded(true)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const closeMobile = () => {
    setMobileExpanded(false)
    setIsOpen(false)
  }

  // ── MOBILE COLLAPSED: just a search icon button
  const MobileCollapsed = () => (
    <button
      onClick={openMobile}
      className="sm:hidden w-11 h-11 bg-white rounded-xl shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all border border-slate-200 flex-shrink-0"
      aria-label={t('placeholder')}
    >
      <Search className="w-5 h-5" />
    </button>
  )

  // ── MOBILE EXPANDED: full-width overlay from top
  const MobileExpanded = () => (
    <div className="sm:hidden fixed inset-0 z-[300] bg-slate-900/50 backdrop-blur-sm flex flex-col">
      <div className="bg-white shadow-2xl">
        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('placeholder')}
              autoFocus
              className="w-full h-11 pl-9 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
            />
            {query && (
              <button onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {/* Coord button inside expanded bar */}
          {onCoordClick && (
            <button onClick={() => { closeMobile(); onCoordClick() }}
              className="w-11 h-11 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
              title={t('coordTitle')}>
              <Navigation className="w-4 h-4" />
            </button>
          )}
          <button onClick={closeMobile}
            className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          </div>
        )}
        {!loading && results.length > 0 && (
          <div className="max-h-[50vh] overflow-y-auto">
            {results.map((result, idx) => (
              <button key={idx} onClick={() => handleSelect(result)}
                className="w-full px-4 py-3.5 flex items-start gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left border-b border-slate-50 last:border-0">
                <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{result.display_name.split(',')[0]}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{result.display_name.split(',').slice(1, 3).join(',').trim()}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {!loading && query.length >= 3 && results.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">{t('noResults')}</p>
          </div>
        )}
      </div>
      {/* Tap outside to close */}
      <div className="flex-1" onClick={closeMobile} />
    </div>
  )

  // ── DESKTOP: full bar always visible
  const DesktopBar = () => (
    <div className={`hidden sm:block relative ${className}`} ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={t('placeholder')}
          className="w-full h-11 pl-11 pr-10 bg-white border border-slate-200 rounded-xl shadow-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
        />
        {(query || loading) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />}
            {query && !loading && (
              <button onClick={clearSearch}
                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50">
          {results.map((result, idx) => (
            <button key={idx} onClick={() => handleSelect(result)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
              <MapPin className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{result.display_name.split(',')[0]}</p>
                <p className="text-xs text-slate-500 truncate">{result.display_name.split(',').slice(1, 3).join(',').trim()}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {isOpen && query.length >= 3 && !loading && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 p-4 text-center z-50">
          <p className="text-sm text-slate-500">{t('noResults')}</p>
        </div>
      )}
    </div>
  )

  return (
    <>
      <MobileCollapsed />
      {mobileExpanded && <MobileExpanded />}
      <DesktopBar />
    </>
  )
}
