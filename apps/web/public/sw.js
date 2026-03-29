// RepairDesk Service Worker
// Handles offline caching and background sync

const CACHE_NAME = "repairdesk-v1";
const STATIC_ASSETS = [
    "/",
    "/dashboard",
    "/tickets",
    "/offline",
];

// Install: cache static shell
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch strategy:
//   - API calls: network-first, fallback to cache
//   - Static assets: cache-first
//   - Navigation: network-first, fallback to /offline
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== "GET") return;

    // API — network first
    if (url.pathname.startsWith("/api/")) {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return res;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Page navigations — network first, offline fallback
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(async () => {
                const cached = await caches.match(request);
                return cached || caches.match("/offline") || Response.error();
            })
        );
        return;
    }

    // Static: cache first
    event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request))
    );
});
