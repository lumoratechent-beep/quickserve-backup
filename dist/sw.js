const CACHE_NAME = 'quickserve-v4';
const OFFLINE_URL = '/offline.html';
const APP_SHELL = ['/', '/index.html', '/manifest.json', OFFLINE_URL];

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
  if (!event.data || event.data.type !== 'PRECACHE_OFFLINE_PAGE') return;

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests (Supabase API, Stripe, fonts, esm.sh CDN)
  // because caching API responses can cause stale business data.
  if (url.origin !== self.location.origin) return;

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

  // Full page loads (refresh/open PWA) -> network first, offline page fallback.
  // This prevents installed tablets from booting a stale app shell that cannot
  // finish startup while the device has no network.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() =>
          caches.match(OFFLINE_URL).then((cached) => {
            return cached || new Response("You're offline", {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
          })
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
