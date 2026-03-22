'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { SearchBar } from '@/components/map/search-bar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { DrawnArea, Search as SearchType } from '@/lib/types'
import { 
  LogOut, 
  User, 
  Layers, 
  Save, 
  FolderOpen,
  ChevronRight,
  X,
  MapPin,
  Square,
  Hexagon,
  Trash2,
  Check
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

// Dynamic import for map (SSR disabled)
const MapComponent = dynamic(
  () => import('@/components/map/map-component').then(mod => mod.MapComponent),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
        <div className="text-slate-400">Caricamento mappa...</div>
      </div>
    )
  }
)

interface SearchResult {
  lat: number
  lon: number
  address: string
}

export function DashboardPage() {
  const { user, signOut } = useAuth()
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [drawnArea, setDrawnArea] = useState<DrawnArea | null>(null)
  const [savedSearches, setSavedSearches] = useState<SearchType[]>([])
  const [showSavePanel, setShowSavePanel] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street')

  const handleSearchSelect = (lat: number, lon: number, address: string) => {
    setSearchResult({ lat, lon, address })
  }

  const handleAreaDrawn = (area: DrawnArea) => {
    setDrawnArea(area)
    setShowSavePanel(true)
  }

  const handleSaveSearch = async () => {
    if (!saveTitle.trim()) return
    
    setSaving(true)
    
    // Simulate save (replace with actual Supabase call)
    const newSearch: SearchType = {
      id: Date.now().toString(),
      user_id: user?.id || '',
      title: saveTitle,
      description: saveDescription,
      address: searchResult?.address,
      latitude: searchResult?.lat,
      longitude: searchResult?.lon,
      area_geojson: drawnArea ? JSON.stringify({ coordinates: drawnArea.coordinates, type: drawnArea.type }) : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    
    setSavedSearches(prev => [newSearch, ...prev])
    setSaveTitle('')
    setSaveDescription('')
    setShowSavePanel(false)
    setSaving(false)
  }

  const handleDeleteSearch = (id: string) => {
    setSavedSearches(prev => prev.filter(s => s.id !== id))
  }

  const clearAll = () => {
    setSearchResult(null)
    setDrawnArea(null)
    setShowSavePanel(false)
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex flex-col">
      {/* Top Bar - Google Maps style */}
      <header className="absolute top-4 left-4 right-4 z-20 flex items-start gap-4">
        {/* Logo & Menu */}
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-14 w-14 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
              >
                <FolderOpen className="w-5 h-5 text-slate-600" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Image src="/logo.jpeg" alt="GeoBridge" width={32} height={32} className="rounded-lg" />
                  GeoBridge
                </SheetTitle>
              </SheetHeader>
              
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{user?.email}</p>
                    <p className="text-xs text-slate-500">Account attivo</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-slate-700">Ricerche salvate</h4>
                  {savedSearches.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">
                      Nessuna ricerca salvata
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {savedSearches.map(search => (
                        <div 
                          key={search.id}
                          className="p-3 bg-white border border-slate-100 rounded-xl hover:border-emerald-200 transition-colors group"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{search.title}</p>
                              {search.address && (
                                <p className="text-xs text-slate-500 truncate mt-0.5">{search.address}</p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleDeleteSearch(search.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-2xl">
          <SearchBar onSearchSelect={handleSearchSelect} />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Map style toggle */}
          <div className="bg-white rounded-full shadow-lg p-1 flex">
            <Button
              variant={mapStyle === 'street' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMapStyle('street')}
              className={`rounded-full px-4 ${mapStyle === 'street' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            >
              Mappa
            </Button>
            <Button
              variant={mapStyle === 'satellite' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setMapStyle('satellite')}
              className={`rounded-full px-4 ${mapStyle === 'satellite' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            >
              Satellite
            </Button>
          </div>

          {/* Logout */}
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-14 w-14 bg-white rounded-full shadow-lg hover:shadow-xl hover:bg-red-50 transition-all"
          >
            <LogOut className="w-5 h-5 text-slate-600" />
          </Button>
        </div>
      </header>

      {/* Map */}
      <div className="flex-1 relative">
        <MapComponent
          onAreaDrawn={handleAreaDrawn}
          onSearchSelect={handleSearchSelect}
          searchResult={searchResult}
          savedAreas={savedSearches}
        />
      </div>

      {/* Draw Tools Legend - Bottom Left */}
      <div className="absolute bottom-6 left-6 z-10">
        <div className="bg-white rounded-2xl shadow-lg p-4 space-y-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Strumenti di disegno</p>
          
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Square className="w-4 h-4 text-emerald-600" />
            </div>
            <span>Rettangolo</span>
          </div>
          
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Hexagon className="w-4 h-4 text-emerald-600" />
            </div>
            <span>Poligono</span>
          </div>
        </div>
      </div>

      {/* Area Info Panel - Bottom Right */}
      {(drawnArea || searchResult) && (
        <div className="absolute bottom-6 right-6 z-10 w-80">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 p-4 text-white">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Area Selezionata</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clearAll}
                  className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-4 space-y-3">
              {searchResult && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-emerald-500 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Indirizzo</p>
                    <p className="text-sm font-medium">{searchResult.address.split(',').slice(0, 2).join(',')}</p>
                  </div>
                </div>
              )}
              
              {drawnArea && (
                <div className="flex items-start gap-2">
                  {drawnArea.type === 'rectangle' ? (
                    <Square className="w-4 h-4 text-emerald-500 mt-0.5" />
                  ) : (
                    <Hexagon className="w-4 h-4 text-emerald-500 mt-0.5" />
                  )}
                  <div>
                    <p className="text-xs text-slate-500">Area disegnata</p>
                    <p className="text-sm font-medium">
                      {drawnArea.area > 0 ? `${drawnArea.area} km²` : 'Area calcolata'}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Save Button */}
            {!showSavePanel && (
              <div className="p-4 pt-0">
                <Button
                  onClick={() => setShowSavePanel(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salva Ricerca
                </Button>
              </div>
            )}
            
            {/* Save Form */}
            {showSavePanel && (
              <div className="p-4 pt-0 space-y-3 border-t">
                <div>
                  <Label htmlFor="title" className="text-xs text-slate-500">Titolo</Label>
                  <Input
                    id="title"
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    placeholder="Es. Area industriale Milano"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="desc" className="text-xs text-slate-500">Descrizione (opzionale)</Label>
                  <Textarea
                    id="desc"
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                    placeholder="Note sulla ricerca..."
                    className="mt-1 h-20"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowSavePanel(false)}
                    className="flex-1"
                  >
                    Annulla
                  </Button>
                  <Button
                    onClick={handleSaveSearch}
                    disabled={!saveTitle.trim() || saving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {saving ? '...' : (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Salva
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Help */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-slate-900/90 backdrop-blur text-white px-4 py-2 rounded-full text-xs flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          Disegna un'area sulla mappa o cerca un indirizzo per iniziare
        </div>
      </div>
    </div>
  )
}
