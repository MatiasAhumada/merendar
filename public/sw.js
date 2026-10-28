importScripts("/sw-config.js");

const CONFIG = self.MERENDAR_SERVICE_WORKER_CONFIG;

function isPublicResponse(response) {
  const cacheControl = response.headers.get(CONFIG.HTTP_POLICY.CACHE_CONTROL_HEADER) || "";
  return response.ok && !response.redirected && !cacheControl.includes(CONFIG.HTTP_POLICY.PRIVATE_CACHE_MARKER) && !cacheControl.includes(CONFIG.HTTP_POLICY.NO_STORE_CACHE_MARKER);
}

function isCanonicalRoute(pathname) {
  return CONFIG.CANONICAL_ROUTES.includes(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CONFIG.CACHE_NAME).then((cache) => cache.addAll(CONFIG.PUBLIC_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(CONFIG.PUBLIC_CACHE_PREFIX) && cacheName !== CONFIG.CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== CONFIG.HTTP_POLICY.GET_METHOD || requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === CONFIG.HTTP_POLICY.NAVIGATE_MODE && isCanonicalRoute(requestUrl.pathname)) {
    event.respondWith(fetch(event.request).then(async (networkResponse) => {
      const responseType = networkResponse.headers.get(CONFIG.HTTP_POLICY.CONTENT_TYPE_HEADER) || "";
      if (isPublicResponse(networkResponse) && responseType.includes(CONFIG.HTTP_POLICY.HTML_CONTENT_TYPE)) {
        const cache = await caches.open(CONFIG.CACHE_NAME);
        await cache.put(requestUrl.pathname, networkResponse.clone());
      }
      return networkResponse;
    }).catch(async () => {
      const cache = await caches.open(CONFIG.CACHE_NAME);
      const cachedShell = await cache.match(requestUrl.pathname);
      if (cachedShell) {
        return cachedShell;
      }
      return Response.error();
    }));
    return;
  }

  if (!requestUrl.pathname.startsWith(CONFIG.STATIC_ASSET_PREFIX) && !CONFIG.PUBLIC_ASSETS.includes(requestUrl.pathname)) {
    return;
  }

  event.respondWith(caches.open(CONFIG.CACHE_NAME).then(async (cache) => {
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
