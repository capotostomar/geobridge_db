'use client'

import { use } from 'react'
import { AnalysisPage } from '@/components/analysis/analysis-page'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <AnalysisPage id={id} />
}
