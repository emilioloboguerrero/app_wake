// Service worker for Wake PWA
// Must be valid JS and served with MIME type application/javascript (not text/html)

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
