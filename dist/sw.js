const CACHE_NAME = 'quickserve-v5';
const OFFLINE_URL = '/offline.html';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  OFFLINE_URL,
  '/LOGO/icon-96x96.png',
  '/LOGO/icon-192x192.png',
  '/LOGO/icon-512x512.png',
  '/LOGO/apple-touch-icon.png',
  '/LOGO/9.png',
  '/LOGO/9-dark.png',
];

// Install: pre-cache the app shell and the offline refresh page.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: remove old caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (!event.data || !['PRECACHE_OFFLINE_PAGE', 'PRECACHE_BASIC_PWA'].includes(event.data.type)) return;

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(event.data.type === 'PRECACHE_BASIC_PWA' ? APP_SHELL : [OFFLINE_URL])
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests (Supabase API, Stripe, fonts, esm.sh CDN)
  // because caching API responses can cause stale business data.
  if (url.origin !== self.location.origin) return;

  // Connectivity checks must prove the network is actually reachable.
  if (event.request.headers.get('X-Connectivity-Check') === 'true') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Content-hashed assets (/assets/*.js, /assets/*.css) -> cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // Full page loads (refresh/open PWA) -> network first, cached app fallback.
  // This lets the React app boot from local data after an offline refresh.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/', copy.clone());
              cache.put('/index.html', copy);
            });
          }
          return response;
        })
        .catch(() =>
          caches.match('/index.html')
            .then((cachedApp) => cachedApp || caches.match('/'))
            .then((cachedApp) => cachedApp || caches.match(OFFLINE_URL))
            .then((cached) =>
              cached || new Response("You're offline", {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
              })
            )
        )
    );
    return;
  }

  // Static HTML/manifest -> stale-while-revalidate.
  if (url.pathname === '/index.html' || url.pathname === '/manifest.json' || url.pathname === OFFLINE_URL) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Everything else (icons, LOGO images, etc.) -> network-first with cache fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          caches.open(CACHE_NAME).then((cache) =>
            cache.put(event.request, response.clone())
          );
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
