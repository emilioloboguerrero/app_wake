// Wake PWA Service Worker — Workbox-based
// Per OFFLINE_ARCHITECTURE.md §5: scope is /app/, no skipWaiting + clients.claim
// Activate on next load to avoid mid-session cache mismatch

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const { precacheAndRoute } = workbox.precaching;
const { registerRoute } = workbox.routing;
const { CacheFirst, NetworkOnly } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

// ─── Precache app shell ───────────────────────────────────────────────────
// Workbox injects the precache manifest here during build
// For now, precache the known static assets manually
precacheAndRoute(self.__WB_MANIFEST || [
  { url: '/app/index.html', revision: null },
]);

// ─── Cache strategies ─────────────────────────────────────────────────────

// Static images from Firebase Storage — cache-first, 30-day TTL
registerRoute(
  ({ url }) =>
    url.hostname === 'firebasestorage.googleapis.com' ||
    url.hostname.includes('storage.googleapis.com'),
  new CacheFirst({
    cacheName: 'wake-storage-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// API responses — network-only (React Query + IndexedDB persistence handles caching)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/'),
  new NetworkOnly()
);

// Cloud Function proxies (MercadoPago payments) — network-only, never cache
registerRoute(
  ({ url }) =>
    url.hostname.includes('cloudfunctions.net') &&
    url.hostname.includes('wolf-20b8b'),
  new NetworkOnly()
);

// Firebase Auth — network-only, never cache
registerRoute(
  ({ url }) =>
    url.hostname.includes('googleapis.com') &&
    (url.pathname.includes('/token') ||
     url.pathname.includes('/accounts') ||
     url.pathname.includes('identitytoolkit')),
  new NetworkOnly()
);

registerRoute(
  ({ url }) =>
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com'),
  new NetworkOnly()
);

// ─── Push notifications ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Wake', body: '' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (_) {
    data.body = event.data ? event.data.text() : '';
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Wake', {
      body: data.body || '',
      icon: '/app/icon-192.png',
      badge: '/app/icon-192.png',
      data: { url: '/app' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/app') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ─── Install: do NOT skipWaiting ──────────────────────────────────────────
// Per OFFLINE_ARCHITECTURE.md §5.4: activate on next load to avoid
// mid-session cache/bundle version mismatch
self.addEventListener('install', () => {
  // Let the new worker wait until all tabs are closed
});

// ─── Activate: clean up old caches ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) =>
            !key.startsWith('workbox-') &&
            key !== 'wake-storage-images'
          )
          .map((key) => caches.delete(key))
      )
    )
  );
});
