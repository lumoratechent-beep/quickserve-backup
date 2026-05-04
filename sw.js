const CACHE_NAME = 'quickserve-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.json'];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests (Supabase API, Stripe, fonts, esm.sh CDN)
  // — these must always go to the network; caching API responses causes stale data.
  if (url.origin !== self.location.origin) return;

  // Content-hashed assets (/assets/*.js, /assets/*.css) → cache-first.
  // The hash in the filename guarantees immutability, so we serve from cache
  // instantly and only hit the network when the file isn't cached yet.
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

  // App shell (HTML, manifest, root) → stale-while-revalidate.
  // Serve from cache immediately so the app loads offline, and update
  // the cache in the background so the next load gets fresh HTML.
  if (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/manifest.json' ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached); // network fail → fall back to cache
          // Return cache immediately if available, otherwise wait for network
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Everything else (icons, LOGO images, etc.) → network-first with cache fallback.
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
