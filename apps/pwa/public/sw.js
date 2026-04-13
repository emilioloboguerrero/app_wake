// Wake PWA Service Worker — Workbox-based
// Per OFFLINE_ARCHITECTURE.md §5: scope is /app/, no skipWaiting + clients.claim
// Activate on next load to avoid mid-session cache mismatch

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const { registerRoute } = workbox.routing;
const { CacheFirst, NetworkOnly, NetworkFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

// ─── App shell: NetworkFirst for navigations ──────────────────────────────
// Never precache /app/index.html — it references hashed bundle filenames
// that get deleted on the next deploy. A stale precached shell causes
// "Unexpected token '<'" errors when the old bundle URL 404s and Hosting's
// SPA rewrite returns the current index.html as HTML.
registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' && url.pathname.startsWith('/app'),
  new NetworkFirst({
    cacheName: 'wake-app-shell-v1',
    networkTimeoutSeconds: 5,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);

// ─── Cache strategies ─────────────────────────────────────────────────────

// Static images from Firebase Storage — cache-first, 30-day TTL
registerRoute(
  ({ url }) =>
    url.hostname === 'firebasestorage.googleapis.com' ||
    url.hostname.includes('storage.googleapis.com'),
  new CacheFirst({
    cacheName: 'wake-storage-images-v2',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
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

// ─── Install: skipWaiting to evict stale precached shell ─────────────────
// Existing users have a precached /app/index.html pointing at deleted bundle
// hashes. We must activate immediately to clear it; otherwise they stay
// broken until every PWA tab is closed.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// ─── Activate: clean up ALL old caches (including workbox-precache) ──────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== 'wake-storage-images-v2' && key !== 'wake-app-shell-v1')
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});
