// Bump this version on any caching-strategy change to purge stale caches.
const CACHE_NAME = 'kitchgoo-v3';

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

  const { pathname } = new URL(req.url);

  // NEVER intercept the API. Caching /api/data/sync (or /api/session) serves
  // stale restaurant state — e.g. a table snapshot from before a KOT was
  // fired — and the app then "syncs" backwards, clearing live orders.
  if (pathname.startsWith('/api/')) {
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

  // Cache-first ONLY for content that is genuinely immutable: Vite's hashed
  // bundles under /assets/ and the small pre-cached asset list. Everything
  // else (dev modules, dynamic requests) goes straight to the network —
  // cache-first on mutable URLs is how devices end up running stale code.
  const isImmutable = pathname.startsWith('/assets/') || ASSETS.includes(pathname);
  if (!isImmutable) {
    return;
  }

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
