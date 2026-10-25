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
  const listeners: Record<string, FetchListener> = {};
  let cacheWrites = 0;
  let cacheReads = 0;
  const publicCache = {
    match: async (request?: string) => {
      cacheReads += 1;
      if (request === "/offline") {
        return new Response("offline shell", { status: 200 });
      }
      return undefined;
    },
    put: async () => {
      cacheWrites += 1;
    },
  };
  const cacheStorage = {
    match: async () => new Response("offline shell", { status: 200 }),
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

  runInNewContext(serviceWorkerSource, {
    self: serviceWorkerGlobal,
    caches: cacheStorage,
    fetch: networkFetch,
    URL,
    Response,
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

test("an offline protected navigation redirects to the public shell with the original route", async () => {
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
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://merendar.example/offline?route=%2Ffamilias%3Ffilter%3Dalerts");
  assert.equal(harness.getCacheWrites(), 0);
});

test("an offline shell request refreshes stale cached HTML when the network is available", async () => {
  const harness = await createWorkerHarness(async () => new Response("fresh offline shell", {
    status: 200,
    headers: { "Cache-Control": "public, max-age=0" },
  }));
  let responsePromise: Promise<Response> | undefined;
  harness.handleFetch({
    request: serviceWorkerRequest("/offline", "cors"),
    respondWith(nextResponse) {
      responsePromise = Promise.resolve(nextResponse);
    },
  });

  assert.ok(responsePromise);
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "fresh offline shell");
  assert.equal(harness.getCacheWrites(), 1);
});

test("an offline shell request serves its cached page when the network is unavailable", async () => {
  const harness = await createWorkerHarness(async () => Promise.reject(new Error("offline")));
  let responsePromise: Promise<Response> | undefined;
  harness.handleFetch({
    request: serviceWorkerRequest("/offline", "cors"),
    respondWith(nextResponse) {
      responsePromise = Promise.resolve(nextResponse);
    },
  });

  assert.ok(responsePromise);
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "offline shell");
  assert.equal(harness.getCacheReads(), 1);
  assert.equal(harness.getCacheWrites(), 0);
});

test("online navigation responses are returned without opening Cache Storage", async () => {
  const harness = await createWorkerHarness(async () => new Response("private HTML", {
    status: 200,
    headers: { "Cache-Control": "private, no-store" },
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
  assert.equal(harness.getCacheReads(), 0);
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
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(harness.getCacheWrites(), 0);
});
