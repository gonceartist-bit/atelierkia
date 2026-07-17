// Service worker for "بانک محتوای آموزشگاه".
// Caches the app shell (manifest/icons) so the app still opens with no
// internet connection. Does NOT cache API calls (Claude/Gemini) - those
// simply fail gracefully and the app falls back to the offline caption
// template (see generateAIContent in index.html).
//
// v2: fixed a bug where, on the SECOND app open (once this service worker
// was actually controlling the page), navigation requests could fail with
// net::ERR_FAILED. The cause: the browser's navigation request object has
// mode:'navigate' and redirect:'manual' baked in, and re-using that exact
// request object inside fetch() here could resolve to a broken/opaque
// response instead of a real page - which the browser then reports as
// ERR_FAILED. The fix is to never reuse the navigation Request object for
// re-fetching; instead we build a plain new request from just the URL, and
// we always guarantee event.respondWith() resolves to a real Response
// (never to `undefined`), which is the other thing that can silently trigger
// ERR_FAILED.

const CACHE_NAME = 'atelier-shell-v2';
const APP_SHELL = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.error('SW install cache error', err))
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
  // Never intercept cross-origin calls (AI APIs, Google Fonts, etc.) -
  // always let those go straight to the network untouched.
  if (url.origin !== self.location.origin) return;

  // Page navigations (opening the app / the installed PWA's start_url):
  // network-first, using a *fresh* request (not the original navigation
  // request object - see note above), falling back to the cached shell
  // only if there's truly no network.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(url.pathname + url.search, { cache: 'no-store' })
        .catch(() => caches.match('./'))
        .then((res) => res || Response.error())
    );
    return;
  }

  // Other same-origin static assets (icons, manifest): cache-first, and
  // refresh the cache in the background for next time.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => null);
      return cached || network.then((res) => res || Response.error());
    })
  );
});
