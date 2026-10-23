const CACHE_NAME = "merendar-public-v3";
const OFFLINE_URL = "/offline";
const PUBLIC_ASSETS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-icon.png",
  "/merendar-logo.png",
  "/brand/merendar-isotipo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("merendar-public-") && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => {
      const offlinePage = await caches.match(OFFLINE_URL);

      if (!offlinePage) {
        return Response.error();
      }

      if (requestUrl.pathname === OFFLINE_URL) {
        return offlinePage;
      }

      const offlineUrl = new URL(OFFLINE_URL, self.location.origin);
      offlineUrl.searchParams.set("route", `${requestUrl.pathname}${requestUrl.search}`);
      return Response.redirect(offlineUrl, 302);
    }));
    return;
  }

  if (!requestUrl.pathname.startsWith("/_next/static/") && !PUBLIC_ASSETS.includes(requestUrl.pathname)) {
    return;
  }

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cachedResponse = await cache.match(event.request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(event.request);
    const cacheControl = networkResponse.headers.get("cache-control") || "";
    const isPublicResponse = networkResponse.ok && !cacheControl.includes("private") && !cacheControl.includes("no-store");

    if (isPublicResponse) {
      await cache.put(event.request, networkResponse.clone());
    }

    return networkResponse;
  }));
});
