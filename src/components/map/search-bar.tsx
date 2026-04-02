'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, MapPin, X, Loader2 } from 'lucide-react'

interface SearchResult {
  display_name: string
  lat: string
  lon: string
  type?: string
}

interface SearchBarProps {
  onSearchSelect: (lat: number, lon: number, address: string) => void
  className?: string
}

export function SearchBar({ onSearchSelect, className = '' }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [showAreaInfo, setShowAreaInfo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 3) {
        setResults([])
        return
      }

      setLoading(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
        )
        const data = await res.json()
        setResults(data)
        setIsOpen(true)
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const handleSelect = (result: SearchResult) => {
    setQuery(result.display_name.split(',').slice(0, 2).join(','))
    setIsOpen(false)
    onSearchSelect(
      parseFloat(result.lat),
      parseFloat(result.lon),
      result.display_name
    )
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    inputRef.current?.focus()
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Search Box - Google Maps style */}
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          <Search className="w-5 h-5" />
        </div>
        
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Cerca un indirizzo, città o luogo..."
          className="w-full h-14 pl-12 pr-24 bg-white rounded-full shadow-lg border-0 text-base focus:ring-2 focus:ring-emerald-500 focus:shadow-xl transition-all"
        />
        
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSearch}
              className="h-10 w-10 rounded-full hover:bg-slate-100"
            >
              <X className="w-4 h-4 text-slate-500" />
            </Button>
          )}
          {loading && (
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500 mr-2" />
          )}
        </div>
      </div>

      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
          {results.map((result, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(result)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="mt-0.5 text-slate-400">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {result.display_name.split(',')[0]}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {result.display_name.split(',').slice(1, 3).join(',')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && query.length >= 3 && !loading && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 text-center z-50">
          <p className="text-sm text-slate-500">Nessun risultato trovato</p>
        </div>
      )}
    </div>
  )
}
