'use client'

import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts'
import { AnalysisResult, RiskLevel } from '@/lib/types'

interface ComparisonChartProps {
  analyses: AnalysisResult[]
  colors: { name: string; hex: string; bg: string; border: string; text: string; light: string }[]
}

function riskColor(level: RiskLevel): string {
  switch (level) {
    case 'basso': return '#10b981'
    case 'medio': return '#f59e0b'
    case 'alto': return '#f97316'
    case 'critico': return '#ef4444'
    default: return '#94a3b8'
  }
}

// Define tooltip components at module level to avoid hook issues
function LineTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; color: string; value: number }>; label?: string }) {
  if (!active || !payload) return null
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.dataKey}:</span>
          <span className="font-semibold" style={{ color: entry.color }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

function BarTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name: string; color: string; value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 text-xs">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function ComparisonChart({ analyses, colors }: ComparisonChartProps) {
  // Build chart data: one entry per period, with each analysis's composite risk
  const periodMap = new Map<string, Record<string, number>>()

  for (const a of analyses) {
    for (const p of a.periods) {
      const label = p.period.split(' / ')[0] // Short period label
      const existing = periodMap.get(label) || {}
      existing[a.id] = p.compositeRisk
      periodMap.set(label, existing)
    }
  }

  const data = Array.from(periodMap.entries()).map(([period, values]) => ({
    period,
    ...values,
  }))

  // Bar chart data
  const barData = analyses.map((a) => ({
    name: a.title,
    Vegetazione: a.categories.find(c => c.name === 'Vegetazione')?.score || 0,
    Idrico: a.categories.find(c => c.name === 'Rischio Idrico')?.score || 0,
    Urbanizzazione: a.categories.find(c => c.name === 'Urbanizzazione')?.score || 0,
    Incendi: a.categories.find(c => c.name === 'Incendi')?.score || 0,
  }))

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">
        Nessun dato disponibile per il grafico
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Line chart: composite risk over time */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Rischio Composito nel Tempo</h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip content={<LineTooltipContent />} />
            <Legend
              formatter={(value: string) => analyses.find(a => a.id === value)?.title || value}
              wrapperStyle={{ fontSize: 12 }}
            />
            <ReferenceLine y={25} stroke="#10b981" strokeDasharray="6 4" strokeOpacity={0.5} label="" />
            <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="6 4" strokeOpacity={0.5} label="" />
            <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="6 4" strokeOpacity={0.5} label="" />
            {analyses.map((a, i) => (
              <Line
                key={a.id}
                type="monotone"
                dataKey={a.id}
                stroke={colors[i % colors.length].hex}
                strokeWidth={2.5}
                dot={{ r: 4, fill: colors[i % colors.length].hex, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar chart: risk categories comparison */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Confronto Categorie di Rischio</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={100} />
            <Tooltip content={<BarTooltipContent />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Vegetazione" fill="#10b981" radius={[0, 4, 4, 0]} />
            <Bar dataKey="Idrico" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            <Bar dataKey="Urbanizzazione" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            <Bar dataKey="Incendi" fill="#ef4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
