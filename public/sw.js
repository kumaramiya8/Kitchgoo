// Bump this version on any caching-strategy change to purge stale caches.
const CACHE_NAME = 'kitchgoo-v2';

// Only pre-cache stable, non-hashed assets. NEVER pre-cache the HTML shell or
// hashed JS/CSS — those must always come from the network so a new deploy is
// picked up immediately. (A cached index.html points at the previous bundle
// hash, which a redeploy deletes, leaving a blank page.)
const ASSETS = [
  '/favicon.svg',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first for navigations / the HTML shell: always load the freshest
  // index.html (which references the current asset hashes); fall back to the
  // cached shell only when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return networkResponse;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for static assets. Hashed bundles are immutable, so a cache hit
  // is always valid; on a miss we fetch and cache for offline use.
  e.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache)).catch(() => {});
        }
        return networkResponse;
      });
    })
  );
});
