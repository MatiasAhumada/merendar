import assert from "node:assert/strict";
import { test } from "node:test";
import axios, { AxiosError, type AxiosResponse } from "axios";
import clientAxios from "@/utils/clientAxios.util";
import { getFamilyCollection } from "@/services/client/family-data.service";
import { OfflineDataUnavailableError } from "@/services/client/offline-snapshot.service";

const familyData = {
  families: [{
    id: "family-1",
    name: "Familia de prueba",
    neighborhood: "Centro",
    address: "Calle 1",
    contactPhone: null,
    contactEmail: null,
    referencePersonId: null,
    members: [],
    createdAt: "2026-10-26T12:00:00.000Z",
    updatedAt: "2026-10-26T12:00:00.000Z",
    version: 1,
  }],
};

function stubFamilyApi(result: () => Promise<{ data: unknown }>) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(clientAxios, "get");
  Object.defineProperty(clientAxios, "get", { configurable: true, value: result });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(clientAxios, "get", originalDescriptor);
    } else {
      Reflect.deleteProperty(clientAxios, "get");
    }
  };
}

test("family data service validates the online API response", async () => {
  const restore = stubFamilyApi(async () => ({ data: familyData }));
  try {
    const result = await getFamilyCollection("test-user", true);
    assert.equal(result.source, "api");
    assert.deepEqual(result.data, familyData);
  } finally {
    restore();
  }
});

test("family data service propagates authorization errors without reading a snapshot", async () => {
  const authorizationError = new AxiosError(
    "Forbidden",
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    undefined,
    { status: 403 } as AxiosResponse,
  );
  const restore = stubFamilyApi(async () => { throw authorizationError; });

  try {
    await assert.rejects(getFamilyCollection("test-user", true), (error: unknown) => error === authorizationError);
  } finally {
    restore();
  }
});

test("family data service rejects an invalid API DTO", async () => {
  const restore = stubFamilyApi(async () => ({ data: { families: [{ id: "family-1", name: 17 }] } }));

  try {
    await assert.rejects(getFamilyCollection("test-user", true), /no reconoce/);
  } finally {
    restore();
  }
});

test("family data service falls back to IndexedDB after a transport failure", async () => {
  const networkError = new AxiosError("Network Error", AxiosError.ERR_NETWORK);
  const restore = stubFamilyApi(async () => { throw networkError; });
  assert.equal(axios.isAxiosError(networkError), true);

  try {
    await assert.rejects(getFamilyCollection("test-user", true), (error: unknown) => error instanceof OfflineDataUnavailableError);
  } finally {
    restore();
  }
});

test("family data service reads IndexedDB directly when already offline", async () => {
  let apiWasCalled = false;
  const restore = stubFamilyApi(async () => {
    apiWasCalled = true;
    return { data: familyData };
  });

  try {
    await assert.rejects(getFamilyCollection("test-user", false), (error: unknown) => error instanceof OfflineDataUnavailableError);
    assert.equal(apiWasCalled, false);
  } finally {
    restore();
  }
});
