// RepairDesk Service Worker v2
// Strategy: cache-first for static, network-first for API/navigation

const CACHE_NAME = 'repairdesk-v2';
const STATIC_PRECACHE = [
  '/',
  '/manifest.json',
  '/disassembly.mp4',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: precache critical shell ──────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails silently per-item; use individual puts for resilience
      Promise.allSettled(
        STATIC_PRECACHE.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API: network-first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Video: cache-first (avoid re-downloading the large MP4)
  if (url.pathname.endsWith('.mp4')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Page navigations: network-first → cache → offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match('/') || Response.error();
      })
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        const clone = res.clone();
        if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        return res;
      });
    })
  );
});
