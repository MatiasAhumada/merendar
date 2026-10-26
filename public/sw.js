const CACHE_NAME = "merendar-public-v6";
const CANONICAL_ROUTES = ["/", "/familias", "/mercaderia", "/entrega", "/usuarios", "/permisos"];
const PUBLIC_ASSETS = [
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-icon.png",
  "/merendar-logo.png",
  "/brand/merendar-isotipo.png",
  "/brand/ministerio-desarrollo-social-tucuman.png",
];

function isPublicResponse(response) {
  const cacheControl = response.headers.get("cache-control") || "";
  return response.ok && !response.redirected && !cacheControl.includes("private") && !cacheControl.includes("no-store");
}

function isCanonicalRoute(pathname) {
  return CANONICAL_ROUTES.includes(pathname);
}

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

  if (event.request.mode === "navigate" && isCanonicalRoute(requestUrl.pathname)) {
    event.respondWith(fetch(event.request).then(async (networkResponse) => {
      const responseType = networkResponse.headers.get("content-type") || "";
      if (isPublicResponse(networkResponse) && responseType.includes("text/html")) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(requestUrl.pathname, networkResponse.clone());
      }
      return networkResponse;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedShell = await cache.match(requestUrl.pathname);
      if (cachedShell) {
        return cachedShell;
      }
      return Response.error();
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
    if (isPublicResponse(networkResponse)) {
      await cache.put(event.request, networkResponse.clone());
    }

    return networkResponse;
  }));
});
