import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from '@/components/ui/sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'GeoBridge - Analisi Satellitare per Valutazione Rischio',
  description: 'Piattaforma per l\'analisi del rischio assicurativo basata su dati satellitari Sentinel-2',
  keywords: ['satellite', 'analisi', 'rischio', 'assicurativo', 'Sentinel-2', 'geospaziale'],
  authors: [{ name: 'GeoBridge Team' }],
  openGraph: {
    title: 'GeoBridge - Analisi Satellitare',
    description: 'Analisi del rischio assicurativo con dati satellitari',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}
