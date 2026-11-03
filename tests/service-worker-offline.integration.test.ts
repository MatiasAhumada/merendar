import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

interface ServiceWorkerRequest {
  url: string;
  method: string;
  mode: string;
}

interface ServiceWorkerFetchEvent {
  request: ServiceWorkerRequest;
  respondWith(response: Promise<Response> | Response): void;
}

type FetchListener = (event: ServiceWorkerFetchEvent) => void;

interface WorkerHarness {
  handleFetch(event: ServiceWorkerFetchEvent): void;
  getCacheWrites(): number;
  getCacheReads(): number;
}

async function createWorkerHarness(networkFetch: (request: ServiceWorkerRequest) => Promise<Response>) {
  const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const serviceWorkerConfigurationSource = await readFile(new URL("../public/sw-config.js", import.meta.url), "utf8");
  const listeners: Record<string, FetchListener> = {};
  const cacheEntries = new Map<string, Response>();
  cacheEntries.set("/familias", new Response("offline shell", { status: 200 }));
  let cacheWrites = 0;
  let cacheReads = 0;
  const publicCache = {
    match: async (request?: string) => {
      cacheReads += 1;
      const cachedResponse = cacheEntries.get(request ?? "");
      return cachedResponse?.clone();
    },
    put: async (request: string, response: Response) => {
      cacheWrites += 1;
      cacheEntries.set(request, response.clone());
    },
  };
  const cacheStorage = {
    match: async () => undefined,
    open: async () => publicCache,
    keys: async () => [],
    delete: async () => true,
  };
  const serviceWorkerGlobal = {
    location: new URL("https://merendar.example"),
    addEventListener: (eventName: string, listener: FetchListener) => {
      listeners[eventName] = listener;
    },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };

  runInNewContext(serviceWorkerConfigurationSource, { self: serviceWorkerGlobal });

  runInNewContext(serviceWorkerSource, {
    self: serviceWorkerGlobal,
    caches: cacheStorage,
    fetch: networkFetch,
    URL,
    Response,
    importScripts: () => undefined,
  });

  return {
    handleFetch(event: ServiceWorkerFetchEvent) {
      listeners.fetch(event);
    },
    getCacheWrites() {
      return cacheWrites;
    },
    getCacheReads() {
      return cacheReads;
    },
  } satisfies WorkerHarness;
}

function serviceWorkerRequest(path: string, mode: string): ServiceWorkerRequest {
  return { url: `https://merendar.example${path}`, method: "GET", mode };
}

test("an offline canonical navigation serves its same-route public shell without redirecting", async () => {
  const harness = await createWorkerHarness(async () => Promise.reject(new Error("offline")));
  let responsePromise: Promise<Response> | undefined;
  harness.handleFetch({
    request: serviceWorkerRequest("/familias?filter=alerts", "navigate"),
    respondWith(nextResponse) {
      responsePromise = Promise.resolve(nextResponse);
    },
  });

  assert.ok(responsePromise);
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(await response.text(), "offline shell");
  assert.equal(harness.getCacheWrites(), 0);
  assert.equal(harness.getCacheReads(), 1);
});

test("an old /offline URL has no service-worker fallback handler", async () => {
  const harness = await createWorkerHarness(async () => Promise.reject(new Error("offline")));
  let responseHandled = false;
  harness.handleFetch({
    request: serviceWorkerRequest("/offline?route=%2Ffamilias", "navigate"),
    respondWith() {
      responseHandled = true;
    },
  });

  assert.equal(responseHandled, false);
  assert.equal(harness.getCacheWrites(), 0);
  assert.equal(harness.getCacheReads(), 0);
});

test("a public canonical HTML response is cached", async () => {
  const harness = await createWorkerHarness(async () => new Response("public route shell", {
    status: 200,
    headers: { "Cache-Control": "public, max-age=0", "Content-Type": "text/html" },
  }));
  let responsePromise: Promise<Response> | undefined;
  harness.handleFetch({
    request: serviceWorkerRequest("/familias", "navigate"),
    respondWith(nextResponse) {
      responsePromise = Promise.resolve(nextResponse);
    },
  });

  assert.ok(responsePromise);
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "public route shell");
  assert.equal(harness.getCacheWrites(), 1);
});

test("private authenticated HTML is never cached", async () => {
  const harness = await createWorkerHarness(async () => new Response("private HTML", {
    status: 200,
    headers: { "Cache-Control": "private, no-store", "Content-Type": "text/html" },
  }));
  let responsePromise: Promise<Response> | undefined;
  harness.handleFetch({
    request: serviceWorkerRequest("/familias", "navigate"),
    respondWith(nextResponse) {
      responsePromise = Promise.resolve(nextResponse);
    },
  });

  assert.ok(responsePromise);
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(harness.getCacheWrites(), 0);
});

test("API responses bypass Cache Storage", async () => {
  const harness = await createWorkerHarness(async () => new Response("private API"));
  let responseHandled = false;
  harness.handleFetch({
    request: serviceWorkerRequest("/api/families", "cors"),
    respondWith() {
      responseHandled = true;
    },
  });

  assert.equal(responseHandled, false);
  assert.equal(harness.getCacheWrites(), 0);
  assert.equal(harness.getCacheReads(), 0);
});

test("a private static response is not written to Cache Storage", async () => {
  const harness = await createWorkerHarness(async () => new Response("private static", {
    status: 200,
    headers: { "Cache-Control": "private, no-store" },
  }));
  let responsePromise: Promise<Response> | undefined;
  harness.handleFetch({
    request: serviceWorkerRequest("/_next/static/chunks/app.js", "script"),
    respondWith(nextResponse) {
      responsePromise = Promise.resolve(nextResponse);
    },
  });

  assert.ok(responsePromise);
  await responsePromise;
  assert.equal(harness.getCacheWrites(), 0);
});
