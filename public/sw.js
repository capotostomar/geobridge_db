/**
 * GeoBridge Service Worker — Geo-fenced Push Notifications
 * Gestisce le notifiche push in background per gli alert di area monitorata
 */

const CACHE_NAME = 'geobridge-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

/* ─── Push event: riceve messaggi dal server (futuro) ─────────────────── */
self.addEventListener('push', (event) => {
  let data = { title: 'GeoBridge Alert', body: 'Un\'area monitorata ha superato le soglie di rischio.', tag: 'geobridge-push' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      actions: [
        { action: 'view', title: 'Vedi analisi' },
        { action: 'dismiss', title: 'Ignora' },
      ],
    })
  )
})

/* ─── Notificationclick: apre l'app alla pagina giusta ───────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const urlToOpen = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(urlToOpen)
          return
        }
      }
      return clients.openWindow(urlToOpen)
    })
  )
})

/* ─── Message: geo-check manuale da app ─────────────────────────────── */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GEOBRIDGE_ALERT') {
    const { title, body, tag, url } = event.data.payload
    self.registration.showNotification(title, {
      body,
      tag: tag || 'geobridge-geofence',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [300, 100, 300],
      data: { url: url || '/' },
      actions: [
        { action: 'view', title: 'Apri analisi' },
        { action: 'dismiss', title: 'Ignora' },
      ],
    })
  }
})
