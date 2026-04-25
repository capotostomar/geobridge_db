'use client'

import { useState } from 'react'
import {
  Building2, TreePine, Wheat, Plus, Star, Bell,
  TrendingUp, MapPin, MoreHorizontal, ChevronRight,
  AlertTriangle, CheckCircle, Clock
} from 'lucide-react'
import { useTranslations } from 'next-intl'

type AssetType = 'property' | 'land' | 'crop'
type MonitoringMode = 'scheduled' | 'threshold'
type AssetStatus = 'normal' | 'alert' | 'pending'

interface Asset {
  id: string
  name: string
  type: AssetType
  location: string
  lat: number
  lon: number
  favorite: boolean
  status: AssetStatus
  monitoring: MonitoringMode
  lastCheck: string
  riskScore: number | null
  alertThreshold: number
  notes?: string
}

const ASSET_ICONS: Record<AssetType, React.ElementType> = {
  property: Building2,
  land: TreePine,
  crop: Wheat,
}

const ASSET_COLORS: Record<AssetType, string> = {
  property: 'bg-blue-50 text-blue-600 border-blue-200',
  land: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  crop: 'bg-amber-50 text-amber-600 border-amber-200',
}

const STATUS_CFG: Record<AssetStatus, { icon: React.ElementType; color: string; label: string }> = {
  normal:  { icon: CheckCircle,   color: 'text-emerald-500', label: 'Normal' },
  alert:   { icon: AlertTriangle, color: 'text-red-500',     label: 'Alert' },
  pending: { icon: Clock,         color: 'text-amber-500',   label: 'Pending' },
}

// Demo assets — in produzione verranno da Supabase
const DEMO_ASSETS: Asset[] = [
  {
    id: '1', name: 'Capannone Via Roma 14', type: 'property',
    location: 'Brescia, Lombardia', lat: 45.54, lon: 10.22,
    favorite: true, status: 'normal', monitoring: 'scheduled',
    lastCheck: new Date(Date.now() - 3 * 86400000).toISOString(),
    riskScore: 23, alertThreshold: 60, notes: 'Immobile commerciale, monitoraggio alluvione'
  },
  {
    id: '2', name: 'Terreno agricolo Loc. Piana', type: 'land',
    location: 'Foggia, Puglia', lat: 41.46, lon: 15.54,
    favorite: false, status: 'alert', monitoring: 'threshold',
    lastCheck: new Date(Date.now() - 1 * 86400000).toISOString(),
    riskScore: 74, alertThreshold: 65, notes: 'Indice deforestazione e siccità'
  },
  {
    id: '3', name: 'Vigneto Barolo DOC', type: 'crop',
    location: 'Barolo, Cuneo', lat: 44.60, lon: 7.94,
    favorite: true, status: 'pending', monitoring: 'scheduled',
    lastCheck: new Date(Date.now() - 7 * 86400000).toISOString(),
    riskScore: null, alertThreshold: 50, notes: 'Analisi trimestrale NDVI e NDMI'
  },
]

function AssetCard({ asset, onToggleFavorite }: { asset: Asset; onToggleFavorite: (id: string) => void }) {
  const t = useTranslations('portfolio')
  const Icon = ASSET_ICONS[asset.type]
  const StatusIcon = STATUS_CFG[asset.status].icon
  const colorCls = ASSET_COLORS[asset.type]
  const statusColor = STATUS_CFG[asset.status].color

  const daysSince = Math.floor((Date.now() - new Date(asset.lastCheck).getTime()) / 86400000)

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all hover:shadow-md ${asset.status === 'alert' ? 'border-red-200' : 'border-slate-200'}`}>
      {asset.status === 'alert' && <div className="h-1 bg-red-500" />}
      {asset.status === 'normal' && <div className="h-1 bg-emerald-500" />}
      {asset.status === 'pending' && <div className="h-1 bg-amber-400" />}

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorCls}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 leading-tight">{asset.name}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] text-slate-500">{asset.location}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onToggleFavorite(asset.id)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${asset.favorite ? 'text-amber-400 hover:text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}>
              <Star className="w-4 h-4" fill={asset.favorite ? 'currentColor' : 'none'} />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{t('riskScore')}</p>
            <p className={`text-base font-bold mt-0.5 ${asset.riskScore === null ? 'text-slate-400' : asset.riskScore > asset.alertThreshold ? 'text-red-500' : 'text-emerald-600'}`}>
              {asset.riskScore !== null ? asset.riskScore : '—'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{t('threshold')}</p>
            <p className="text-base font-bold text-slate-700 mt-0.5">{asset.alertThreshold}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{t('lastCheck')}</p>
            <p className="text-base font-bold text-slate-700 mt-0.5">{daysSince}d</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-3.5 h-3.5 ${statusColor}`} />
            <span className={`text-[10px] font-semibold ${statusColor}`}>{STATUS_CFG[asset.status].label}</span>
            <span className="text-[10px] text-slate-400">·</span>
            <div className="flex items-center gap-1">
              {asset.monitoring === 'scheduled' ? <Clock className="w-3 h-3 text-slate-400" /> : <Bell className="w-3 h-3 text-slate-400" />}
              <span className="text-[10px] text-slate-400">{asset.monitoring === 'scheduled' ? t('scheduled') : t('threshold')}</span>
            </div>
          </div>
          <button className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold hover:text-emerald-700 transition-colors">
            {t('viewHistory')} <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {asset.notes && (
          <p className="mt-2 text-[10px] text-slate-400 italic truncate">{asset.notes}</p>
        )}
      </div>
    </div>
  )
}

export function PortfolioPanel() {
  const t = useTranslations('portfolio')
  const [assets, setAssets] = useState<Asset[]>(DEMO_ASSETS)
  const [filter, setFilter] = useState<'all' | AssetType>('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const toggleFavorite = (id: string) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, favorite: !a.favorite } : a))
  }

  const filtered = assets
    .filter(a => filter === 'all' || a.type === filter)
    .filter(a => !favoritesOnly || a.favorite)
    .sort((a, b) => {
      if (a.favorite && !b.favorite) return -1
      if (!a.favorite && b.favorite) return 1
      if (a.status === 'alert' && b.status !== 'alert') return -1
      if (a.status !== 'alert' && b.status === 'alert') return 1
      return 0
    })

  const alertCount = assets.filter(a => a.status === 'alert').length

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-slate-500 text-xs">{t('assetSubtitle', { count: assets.length })}</p>
          {alertCount > 0 && (
            <p className="text-red-500 text-xs font-semibold mt-0.5">⚠ {t('alertsActive', { count: alertCount })}</p>
          )}
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 h-8 px-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
          <Plus className="w-3.5 h-3.5" /> {t('addAsset')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
          {(['all', 'property', 'land', 'crop'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {f === 'all' ? t('filterAll') : t(`filterType.${f}`)}
            </button>
          ))}
        </div>
        <button onClick={() => setFavoritesOnly(v => !v)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-all ${favoritesOnly ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          <Star className="w-3.5 h-3.5" fill={favoritesOnly ? 'currentColor' : 'none'} />
          {t('favoritesOnly')}
        </button>
      </div>

      {/* Asset grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <TrendingUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">{t('noAssets')}</p>
          <p className="text-slate-400 text-xs mt-1 mb-4">{t('noAssetsSub')}</p>
          <button onClick={() => setShowAddModal(true)}
            className="h-9 px-5 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-colors">
            {t('addFirst')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(asset => (
            <AssetCard key={asset.id} asset={asset} onToggleFavorite={toggleFavorite} />
          ))}
        </div>
      )}

      {/* Coming soon banner */}
      <div className="mt-6 p-4 bg-gradient-to-r from-violet-50 to-sky-50 border border-violet-200 rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-violet-900">{t('comingSoonTitle')}</p>
            <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">{t('comingSoonDesc')}</p>
          </div>
        </div>
      </div>

      {/* Add Asset Modal placeholder */}
      {showAddModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <h2 className="text-slate-900 font-bold text-base mb-1">{t('addAssetTitle')}</h2>
            <p className="text-slate-500 text-xs mb-4">{t('addAssetDesc')}</p>
            <div className="space-y-3">
              <input placeholder={t('assetNamePlaceholder')}
                className="w-full h-10 border border-slate-200 rounded-xl px-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all" />
              <div className="grid grid-cols-3 gap-2">
                {(['property', 'land', 'crop'] as AssetType[]).map(type => {
                  const Icon = ASSET_ICONS[type]
                  return (
                    <button key={type}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 border-slate-200 hover:border-emerald-400 transition-all text-slate-600 hover:text-emerald-700">
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-semibold">{t(`filterType.${type}`)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddModal(false)}
                className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
                {t('cancel')}
              </button>
              <button className="flex-1 h-10 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl transition-colors opacity-50 cursor-not-allowed" disabled>
                {t('comingSoon')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
