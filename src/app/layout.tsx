import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from '@/components/ui/sonner'
import { getLocale, getMessages } from 'next-intl/server'
import { Providers } from './providers'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GeoBridge - Satellite Risk Analysis',
  description: 'Insurance risk analysis platform powered by Sentinel-2 satellite data',
  keywords: ['satellite', 'analysis', 'risk', 'insurance', 'Sentinel-2', 'geospatial'],
  authors: [{ name: 'GeoBridge Team' }],
  manifest: '/manifest.json',
  openGraph: {
    title: 'GeoBridge - Satellite Analysis',
    description: 'Insurance risk analysis with satellite data',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                  .then(function(reg) { console.log('[GeoBridge SW] Registered:', reg.scope) })
                  .catch(function(err) { console.warn('[GeoBridge SW] Registration error:', err) })
              })
            }
          `
        }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`} suppressHydrationWarning>
        <Providers locale={locale} messages={messages as Record<string, unknown>}>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  )
}
