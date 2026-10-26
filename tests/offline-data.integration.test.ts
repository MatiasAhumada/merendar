import assert from "node:assert/strict";
import { test } from "node:test";
import axios, { AxiosError, type AxiosResponse } from "axios";
import { z } from "zod";
import { OfflineDataUnavailableError, resolveOfflineData } from "@/services/offline-data.service";

const familySchema = z.object({ families: z.array(z.object({ id: z.string(), name: z.string() })) });
const familyData = { families: [{ id: "family-1", name: "Familia de prueba" }] };

test("online data uses the validated API DTO", async () => {
  const result = await resolveOfflineData({
    userId: "test-user",
    route: "/familias",
    isOnline: true,
    schema: familySchema,
    loadFromApi: async () => familyData,
  });

  assert.equal(result.source, "api");
  assert.deepEqual(result.data, familyData);
});

test("an HTTP authorization failure is propagated and never reads a local snapshot", async () => {
  const authorizationError = new AxiosError(
    "Forbidden",
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    undefined,
    { status: 403 } as AxiosResponse,
  );

  await assert.rejects(
    resolveOfflineData({
      userId: "test-user",
      route: "/familias",
      isOnline: true,
      schema: familySchema,
      loadFromApi: async () => { throw authorizationError; },
    }),
    (error: unknown) => error === authorizationError,
  );
});

test("an invalid online DTO is rejected instead of falling back to cached data", async () => {
  await assert.rejects(
    resolveOfflineData({
      userId: "test-user",
      route: "/familias",
      isOnline: true,
      schema: familySchema,
      loadFromApi: async () => ({ families: [{ id: "family-1", name: 17 }] }),
    }),
    /no reconoce/,
  );
});

test("transport failures attempt the prepared snapshot fallback", async () => {
  const networkError = new AxiosError("Network Error", AxiosError.ERR_NETWORK);
  assert.equal(axios.isAxiosError(networkError), true);

  await assert.rejects(
    resolveOfflineData({
      userId: "test-user",
      route: "/familias",
      isOnline: true,
      schema: familySchema,
      loadFromApi: async () => { throw networkError; },
    }),
    (error: unknown) => error instanceof OfflineDataUnavailableError,
  );
});
