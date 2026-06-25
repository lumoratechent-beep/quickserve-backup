const CACHE_NAME = 'quickserve-v7';
const OFFLINE_URL = '/offline.html';
const STATIC_SHELL = [
  '/manifest.json',
  OFFLINE_URL,
  '/LOGO/icon-96x96.png',
  '/LOGO/icon-192x192.png',
  '/LOGO/icon-512x512.png',
  '/LOGO/apple-touch-icon.png',
  '/LOGO/9.png',
  '/LOGO/9-dark.png',
];

const APP_DOCUMENT_URLS = ['/', '/index.html'];

const getContentType = (response) => response.headers.get('content-type') || '';

const isHtmlResponse = (response) => getContentType(response).includes('text/html');

const isAssetResponseValid = (response, pathname) => {
  if (!response || !response.ok) return false;

  const contentType = getContentType(response);
  if (pathname.endsWith('.css')) return contentType.includes('text/css');
  if (pathname.endsWith('.js')) return contentType.includes('javascript');

  return !isHtmlResponse(response);
};

const assetUnavailableResponse = () => new Response('', {
  status: 504,
  statusText: 'Asset unavailable',
});

const getAssetUrlsFromHtml = (html) => {
  const urls = new Set();
  const assetPattern = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
  let match;

  while ((match = assetPattern.exec(html)) !== null) {
    urls.add(match[1]);
  }

  return [...urls];
};

const cacheAppDocument = async (response) => {
  const html = await response.clone().text();
  const cache = await caches.open(CACHE_NAME);

  const assetUrls = getAssetUrlsFromHtml(html);
  if (assetUrls.length > 0) {
    const assetResults = await Promise.all(
      assetUrls.map((url) =>
        fetch(url, { cache: 'reload' })
          .then((assetResponse) => {
            if (!isAssetResponseValid(assetResponse, new URL(url, self.location.origin).pathname)) {
              return false;
            }

            return cache.put(url, assetResponse).then(() => true);
          })
          .catch(() => false)
      )
    );

    if (assetResults.some((cached) => !cached)) return;
  }

  await Promise.all(APP_DOCUMENT_URLS.map((url) => cache.put(url, response.clone())));
};

const fetchAndCacheAppDocument = async () => {
  const response = await fetch('/', { cache: 'reload' });
  if (response.ok) await cacheAppDocument(response.clone());
  return response;
};

// Install: pre-cache the static shell only. App HTML is fetched network-first
// so it cannot point at hashed CSS/JS files that have already been replaced.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL))
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

  if (event.data.type === 'PRECACHE_BASIC_PWA') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => cache.addAll(STATIC_SHELL))
        .then(() => fetchAndCacheAppDocument())
        .catch(() => undefined)
    );
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
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

  // Content-hashed assets (/assets/*.js, /assets/*.css) -> cache-first,
  // but never cache SPA fallback HTML as an asset.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then(async (cached) => {
          if (cached && isAssetResponseValid(cached, url.pathname)) return cached;
          if (cached) await cache.delete(event.request);

          return fetch(event.request).then((response) => {
            if (isAssetResponseValid(response, url.pathname)) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() =>
            caches.match(event.request).then((fallback) => fallback || assetUnavailableResponse())
          );
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
            cacheAppDocument(response.clone()).catch(() => undefined);
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

  // App HTML must stay network-first because it references content-hashed assets.
  if (url.pathname === '/index.html') {
    event.respondWith(
      fetchAndCacheAppDocument()
        .catch(() =>
          caches.match('/index.html')
            .then((cachedApp) => cachedApp || caches.match('/'))
            .then((cachedApp) => cachedApp || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Static manifest/offline page -> stale-while-revalidate.
  if (url.pathname === '/manifest.json' || url.pathname === OFFLINE_URL) {
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
