/**
 * sw.js — AssetRadar service worker (registered only in production builds).
 * - Static app files: cache-first, precached on install; the cache name carries the build id,
 *   so every new build replaces the old cache.
 * - Page navigations: network-first, falling back to the cached app shell when offline.
 * - /api/*: network-first with the last good response as an offline fallback. Fallback
 *   responses carry the header "X-AssetRadar-Offline: 1" so the app labels them as saved data.
 * - Live streams (Server-Sent Events) and cross-origin requests are never touched.
 * BUILD_ID and PRECACHE are filled in by the Vite build (see vite.config.ts).
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = ['__PRECACHE__'];
const STATIC_CACHE = `assetradar-static-${BUILD_ID}`;
const API_CACHE = 'assetradar-api-v1';
const STREAMS = ['/api/market/news-stream', '/api/market/price-stream'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE.filter((p) => !p.startsWith('__'))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('assetradar-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (!cached) throw err;
    const headers = new Headers(cached.headers);
    headers.set('X-AssetRadar-Offline', '1');
    return new Response(await cached.blob(), { status: cached.status, statusText: cached.statusText, headers });
  }
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(STATIC_CACHE)).put('/index.html', response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match('/index.html');
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC_CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (STREAMS.includes(url.pathname) || request.headers.get('accept')?.includes('text/event-stream')) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
