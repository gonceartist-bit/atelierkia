// Minimal offline-first service worker for the "بانک محتوای آموزشگاه" app.
// Caches the app shell (HTML/manifest/icons) so the app still opens with no
// internet connection. It does NOT cache API calls (Claude/Gemini) or fonts
// aggressively - those simply fail gracefully and the app falls back to the
// offline caption template (see generateAIContent in index.html).

const CACHE_NAME = 'atelier-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept calls to AI APIs - always go to the network for those.
  if (url.origin.includes('anthropic.com') || url.origin.includes('googleapis.com')) return;

  // App shell files: cache-first, refresh cache in the background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
