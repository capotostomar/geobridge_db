import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from '@/components/ui/sonner'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GeoBridge - Analisi Satellitare per Valutazione Rischio',
  description: 'Piattaforma per l\'analisi del rischio assicurativo basata su dati satellitari Sentinel-2',
  keywords: ['satellite', 'analisi', 'rischio', 'assicurativo', 'Sentinel-2', 'geospaziale'],
  authors: [{ name: 'GeoBridge Team' }],
  manifest: '/manifest.json',
  openGraph: {
    title: 'GeoBridge - Analisi Satellitare',
    description: 'Analisi del rischio assicurativo con dati satellitari',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f172a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                  .then(function(reg) { console.log('[GeoBridge SW] Registrato:', reg.scope) })
                  .catch(function(err) { console.warn('[GeoBridge SW] Errore registrazione:', err) })
              })
            }
          `
        }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`} suppressHydrationWarning>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}
