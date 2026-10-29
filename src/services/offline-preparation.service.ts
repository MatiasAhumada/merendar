import type { z } from "zod";


import { HTTP_CONTENT_TYPES, HTTP_REQUEST, HTTP_RESPONSE_TYPES, HTTP_CACHE_CONTROL, HTTP_HEADERS, NO_STORE_REQUEST_HEADERS } from "@/constants/http.constant";
import { OFFLINE_PREPARATION, OFFLINE_PREPARATION_MESSAGES, type OfflinePreparedRoute } from "@/constants/offline.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { dashboardSummaryResponseSchema } from "@/schemas/dashboard.schema";
import { beneficiarySheetCollectionSchema, documentTypeSchema, jsonRecordSchema, jsonValueSchema, legacyOfflinePreparationSchema, nonEmptyStringSchema, offlineAccountSchema, offlinePreparationSchema, offlinePreparedDocumentSchema, offlinePreparedDocumentsSchema, previousOfflinePreparationSchema } from "@/schemas/offline.schema";
import axios from "axios";

import clientAxios from "@/utils/clientAxios.util";
import type { JsonValue } from "@/types/json-value";

const merchandiseDocumentUrl = API_ROUTES.MERCHANDISE_DOCUMENT;
const renditionDocumentUrl = API_ROUTES.RENDITION_DOCUMENT;

export type OfflinePreparation = z.infer<typeof offlinePreparationSchema>;
export type OfflinePreparedDocument = z.infer<typeof offlinePreparedDocumentSchema>;
export interface OfflinePreparedWorkspace {
  preparation: OfflinePreparation | null;
  documents: OfflinePreparedDocument[];
}

interface OfflineDocumentReference {
  id: string;
  originalName: string;
  url: string;
  documentType: NonNullable<OfflinePreparedDocument["documentType"]>;
}

export class OfflinePreparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflinePreparationError";
  }
}

export function normalizeStoredOfflinePreparation(value: unknown) {
  const currentPreparation = offlinePreparationSchema.safeParse(value);
  if (currentPreparation.success) {
    return { preparation: currentPreparation.data, needsMigration: false };
  }

  const previousPreparation = previousOfflinePreparationSchema.safeParse(value);
  if (previousPreparation.success) {
    const migratedSnapshots = Object.fromEntries(
      Object.entries(previousPreparation.data.snapshots).map(([route, snapshot]) => [route, {
        ...snapshot,
        schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
      }]),
    );

    return {
      preparation: {
        ...previousPreparation.data,
        schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
        snapshots: migratedSnapshots,
      },
      needsMigration: true,
    };
  }

  const legacyPreparation = legacyOfflinePreparationSchema.safeParse(value);
  if (!legacyPreparation.success) {
    return { preparation: null, needsMigration: false };
  }

  const migratedSnapshots = Object.fromEntries(
    Object.entries(legacyPreparation.data.snapshots).map(([route, data]) => [route, {
      schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
      capturedAt: legacyPreparation.data.preparedAt,
      data,
    }]),
  );

  return {
    preparation: {
      ...legacyPreparation.data,
      schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
      snapshots: migratedSnapshots,
    },
    needsMigration: true,
  };
}

const ACCOUNT_DATABASE = "merendar-offline-account-index";
const ACCOUNT_STORE = "active-account";
const ACTIVE_ACCOUNT_KEY = "active";

function databaseName(userId: string) {
  return `${OFFLINE_PREPARATION.DATABASE_PREFIX}-${encodeURIComponent(userId)}`;
}

function openDatabase(userId: string): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.UNSUPPORTED_BROWSER));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(userId), OFFLINE_PREPARATION.DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OFFLINE_PREPARATION.STORE)) {
        request.result.createObjectStore(OFFLINE_PREPARATION.STORE, { keyPath: "key" });
      }
      if (!request.result.objectStoreNames.contains(OFFLINE_PREPARATION.DOCUMENTS_STORE)) {
        request.result.createObjectStore(OFFLINE_PREPARATION.DOCUMENTS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.OPEN_FAILED));
    request.onblocked = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.UPDATE_TABS));
  });
}

function openAccountDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ACCOUNT_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ACCOUNT_STORE)) {
        request.result.createObjectStore(ACCOUNT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.ACTIVE_ACCOUNT_UPDATE_FAILED));
  });
}

export async function setActiveOfflineAccount(userId: string) {
  if (!globalThis.indexedDB) {
    return;
  }

  const database = await openAccountDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ACCOUNT_STORE, "readwrite");
      transaction.objectStore(ACCOUNT_STORE).put({ key: ACTIVE_ACCOUNT_KEY, userId });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.ACTIVE_ACCOUNT_UPDATE_FAILED));
    });
  } finally {
    database.close();
  }
}

export async function readActiveOfflineAccount() {
  if (!globalThis.indexedDB) {
    return null;
  }

  const database = await openAccountDatabase();

  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = database.transaction(ACCOUNT_STORE, "readonly").objectStore(ACCOUNT_STORE).get(ACTIVE_ACCOUNT_KEY);
      request.onsuccess = () => {
        const accountId = offlineAccountSchema.safeParse(request.result);
        if (accountId.success) {
          resolve(accountId.data.userId);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.ACTIVE_ACCOUNT_READ_FAILED));
    });
  } finally {
    database.close();
  }
}

export async function clearActiveOfflineAccount(userId: string) {
  const activeAccountId = await readActiveOfflineAccount();
  if (!activeAccountId || activeAccountId !== userId) {
    return;
  }

  const database = await openAccountDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ACCOUNT_STORE, "readwrite");
      transaction.objectStore(ACCOUNT_STORE).delete(ACTIVE_ACCOUNT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.ACTIVE_ACCOUNT_CLEANUP_FAILED));
    });
  } finally {
    database.close();
  }
}

async function cachePublicOfflineShellAssets() {
  const cache = await caches.open(OFFLINE_PREPARATION.PUBLIC_CACHE_NAME);
  const assetsToCache = new Set<string>();

  for (const route of OFFLINE_PREPARATION.ROUTES) {
    const response = await fetch(route, { cache: HTTP_CACHE_CONTROL.NO_STORE, credentials: HTTP_REQUEST.SAME_ORIGIN, redirect: HTTP_REQUEST.MANUAL_REDIRECT });
    const contentType = response.headers.get("content-type") ?? "";
    const cacheControl = response.headers.get(HTTP_HEADERS.CACHE_CONTROL) ?? "";
    const isPublicShell = response.ok
      && !response.redirected
      && contentType.includes(HTTP_CONTENT_TYPES.HTML)
      && !cacheControl.includes(HTTP_CACHE_CONTROL.PRIVATE)
      && !cacheControl.includes(HTTP_CACHE_CONTROL.NO_STORE);

    if (!isPublicShell) {
      throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.PUBLIC_ROUTE_PREPARATION_FAILED(route));
    }

    const shellHtml = await response.text();
    await cache.put(route, new Response(shellHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        [HTTP_HEADERS.CACHE_CONTROL]: HTTP_CACHE_CONTROL.PUBLIC_REVALIDATE,
      },
    }));

    const routeAssets = [...shellHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((assetPath) => assetPath.startsWith("/_next/static/"));
    for (const assetPath of routeAssets) {
      assetsToCache.add(assetPath);
    }
  }

  for (const assetPath of assetsToCache) {
    if (assetPath.endsWith(".css")) {
      const stylesheetResponse = await clientAxios.get<string>(assetPath, { responseType: HTTP_RESPONSE_TYPES.TEXT, headers: NO_STORE_REQUEST_HEADERS });
      const stylesheetAssets = [...stylesheetResponse.data.matchAll(/url\(["']?([^"')]+)["']?\)/g)]
        .map((match) => match[1])
        .filter((nestedAssetPath) => nestedAssetPath.startsWith("/_next/static/"));
      for (const nestedAssetPath of stylesheetAssets) {
        assetsToCache.add(nestedAssetPath);
      }
    }
  }

  await Promise.all([...assetsToCache].map((assetPath) => clientAxios.get<ArrayBuffer>(assetPath, {
    responseType: "arraybuffer",
    headers: NO_STORE_REQUEST_HEADERS,
  })));
}

function collectDocumentReferences(value: JsonValue, references: OfflineDocumentReference[]) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDocumentReferences(entry, references);
    }
    return;
  }

  const parsedObject = jsonRecordSchema.safeParse(value);
  if (!parsedObject.success) {
    return;
  }

  const documentId = nonEmptyStringSchema.safeParse(parsedObject.data.id);
  const originalName = nonEmptyStringSchema.safeParse(parsedObject.data.originalName);
  const contentType = nonEmptyStringSchema.safeParse(parsedObject.data.contentType);
  const documentType = documentTypeSchema.safeParse(parsedObject.data.documentType);

  if (documentId.success && originalName.success && contentType.success) {
    references.push({ id: documentId.data, originalName: originalName.data, url: merchandiseDocumentUrl(documentId.data), documentType: "merchandise" });
  }

  if (documentId.success && originalName.success && documentType.success) {
    references.push({ id: documentId.data, originalName: originalName.data, url: renditionDocumentUrl(documentId.data), documentType: "rendition" });
  }

  for (const nestedValue of Object.values(parsedObject.data)) {
    collectDocumentReferences(nestedValue, references);
  }
}

function collectBeneficiarySheetReferences(value: JsonValue, references: OfflineDocumentReference[]) {
  const parsedCollection = beneficiarySheetCollectionSchema.safeParse(value);

  if (!parsedCollection.success) {
    throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.INVALID_SHEETS_RESPONSE);
  }

  for (const sheet of parsedCollection.data.sheets) {
    references.push({
      id: sheet.id,
      originalName: `planilla-${sheet.periodId}-v${sheet.version}.pdf`,
      url: API_ROUTES.RECORD_SHEET(sheet.id),
      documentType: "beneficiary-sheet",
    });
  }
}

function collectPreparedDocumentReferences(snapshots: OfflinePreparation["snapshots"]) {
  const documentReferences: OfflineDocumentReference[] = [];

  for (const snapshot of Object.values(snapshots)) {
    collectDocumentReferences(snapshot.data, documentReferences);
  }

  const recordsSnapshot = snapshots[ROUTES.DELIVERY];
  if (recordsSnapshot) {
    collectBeneficiarySheetReferences(recordsSnapshot.data, documentReferences);
  }

  return documentReferences;
}

async function downloadPreparedDocuments(snapshots: OfflinePreparation["snapshots"]) {
  const documentReferences = collectPreparedDocumentReferences(snapshots);
  const uniqueReferences = [...new Map(documentReferences.map((reference) => [`${reference.url}:${reference.id}`, reference])).values()];
  const documents: OfflinePreparedDocument[] = [];
  let totalByteSize = 0;

  for (const reference of uniqueReferences) {
    const response = await clientAxios.get<Blob>(reference.url, { responseType: HTTP_RESPONSE_TYPES.BLOB, headers: NO_STORE_REQUEST_HEADERS });
    const content = response.data;

    if (content.size > OFFLINE_PREPARATION.MAX_DOCUMENT_BYTES) {
      throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.DOCUMENT_TOO_LARGE(reference.originalName));
    }

    totalByteSize += content.size;
    if (totalByteSize > OFFLINE_PREPARATION.MAX_DOCUMENTS_TOTAL_BYTES) {
      throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.DOCUMENTS_OVER_CAPACITY);
    }

    const contentType = response.headers["content-type"];
    documents.push({
      id: reference.id,
      originalName: reference.originalName,
      contentType: nonEmptyStringSchema.parse(contentType),
      byteSize: content.size,
      content,
      documentType: reference.documentType,
    });
  }

  return documents;
}

async function ensurePreparationStorageCapacity(snapshots: OfflinePreparation["snapshots"], documents: OfflinePreparedDocument[]) {
  const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshots)).length;
  const documentBytes = documents.reduce((totalBytes, document) => totalBytes + document.byteSize, 0);
  const requiredBytes = snapshotBytes + documentBytes + OFFLINE_PREPARATION.STORAGE_RESERVE_BYTES;
  const storageEstimate = await navigator.storage?.estimate();

  if (storageEstimate?.quota && storageEstimate.quota - (storageEstimate.usage ?? 0) < requiredBytes) {
    throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.STORAGE_CAPACITY_INSUFFICIENT);
  }
}

async function savePreparation(preparation: OfflinePreparation, documents: OfflinePreparedDocument[]) {
  const database = await openDatabase(preparation.userId);

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([OFFLINE_PREPARATION.STORE, OFFLINE_PREPARATION.DOCUMENTS_STORE], "readwrite");
      transaction.objectStore(OFFLINE_PREPARATION.STORE).put({ key: OFFLINE_PREPARATION.KEY, ...preparation });
      const documentStore = transaction.objectStore(OFFLINE_PREPARATION.DOCUMENTS_STORE);
      const existingDocumentsRequest = documentStore.getAll();
      existingDocumentsRequest.onsuccess = () => {
        const existingDocuments = offlinePreparedDocumentsSchema.safeParse(existingDocumentsRequest.result);
        documentStore.clear();
        let localSheetDocuments: typeof documents = [];

        if (existingDocuments.success) {
          localSheetDocuments = existingDocuments.data
            .filter((document) => document.documentType === "beneficiary-sheet-local")
            .map((document) => {
              if (document.id.startsWith("local:")) {
                return document;
              }

              return { ...document, id: `local:${document.id}` };
            });
        }
        for (const document of [...documents, ...localSheetDocuments]) {
          documentStore.put(document);
        }
      };
      existingDocumentsRequest.onerror = () => {
        reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.LOCAL_SHEETS_PRESERVATION_FAILED));
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.SAVE_FAILED));
      transaction.onabort = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.SAVE_FAILED));
    });
  } finally {
    database.close();
  }
}

export async function saveOfflinePreparedDocument(userId: string, document: OfflinePreparedDocument) {
  const parsedDocument = offlinePreparedDocumentSchema.safeParse(document);
  if (!parsedDocument.success || parsedDocument.data.byteSize > OFFLINE_PREPARATION.MAX_DOCUMENT_BYTES) {
    throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.INVALID_LOCAL_SHEET);
  }

  const preparation = await readOfflinePreparation(userId);
  if (!preparation) {
    throw new OfflinePreparationError(OFFLINE_PREPARATION.MESSAGES.NOT_PREPARED);
  }

  const existingDocuments = await readOfflinePreparedDocuments(userId);
  const totalBytes = existingDocuments
    .filter((existingDocument) => existingDocument.id !== parsedDocument.data.id)
    .reduce((total, existingDocument) => total + existingDocument.byteSize, parsedDocument.data.byteSize);
  if (totalBytes > OFFLINE_PREPARATION.MAX_DOCUMENTS_TOTAL_BYTES) {
    throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.PDF_STORAGE_INSUFFICIENT);
  }
  const storageEstimate = await navigator.storage?.estimate();
  if (storageEstimate?.quota && storageEstimate.quota - (storageEstimate.usage ?? 0) < parsedDocument.data.byteSize + OFFLINE_PREPARATION.STORAGE_RESERVE_BYTES) {
    throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.PDF_STORAGE_INSUFFICIENT);
  }

  const database = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_PREPARATION.DOCUMENTS_STORE, "readwrite");
      transaction.objectStore(OFFLINE_PREPARATION.DOCUMENTS_STORE).put(parsedDocument.data);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.SAVE_LOCAL_SHEET_FAILED));
      transaction.onabort = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.SAVE_LOCAL_SHEET_FAILED));
    });
  } finally {
    database.close();
  }
}

export async function removeOfflinePreparedDocument(userId: string, documentId: string) {
  const database = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_PREPARATION.DOCUMENTS_STORE, "readwrite");
      transaction.objectStore(OFFLINE_PREPARATION.DOCUMENTS_STORE).delete(documentId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.REMOVE_INCOMPLETE_LOCAL_SHEET_FAILED));
      transaction.onabort = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.REMOVE_INCOMPLETE_LOCAL_SHEET_FAILED));
    });
  } finally {
    database.close();
  }
}

async function saveMigratedPreparation(preparation: OfflinePreparation) {
  const database = await openDatabase(preparation.userId);

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_PREPARATION.STORE, "readwrite");
      transaction.objectStore(OFFLINE_PREPARATION.STORE).put({ key: OFFLINE_PREPARATION.KEY, ...preparation });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.UPDATE_SCHEMA_FAILED));
      transaction.onabort = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.UPDATE_SCHEMA_FAILED));
    });
  } finally {
    database.close();
  }
}

export async function readOfflinePreparation(userId: string): Promise<OfflinePreparation | null> {
  if (!globalThis.indexedDB) {
    return null;
  }

  const database = await openDatabase(userId);

  let storedPreparation: unknown;

  try {
    storedPreparation = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction(OFFLINE_PREPARATION.STORE, "readonly")
        .objectStore(OFFLINE_PREPARATION.STORE)
        .get(OFFLINE_PREPARATION.KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.READ_FAILED));
    });
    const parsedPreparation = normalizeStoredOfflinePreparation(storedPreparation);

    if (!parsedPreparation.preparation || parsedPreparation.preparation.userId !== userId) {
      return null;
    }

    const currentTime = Date.now();
    const preparedTime = Date.parse(parsedPreparation.preparation.preparedAt);
    const expirationTime = Date.parse(parsedPreparation.preparation.expiresAt);
    const sessionExpirationTime = Date.parse(parsedPreparation.preparation.sessionExpiresAt);
    const preparedDuration = OFFLINE_PREPARATION.MAX_AGE_HOURS * 60 * 60_000;
    const expirationExceedsPolicy = expirationTime > sessionExpirationTime || expirationTime > preparedTime + preparedDuration;

    if (currentTime >= expirationTime || currentTime >= preparedTime + preparedDuration || expirationExceedsPolicy) {
      storedPreparation = null;
    } else {
      if (parsedPreparation.needsMigration) {
        await saveMigratedPreparation(parsedPreparation.preparation);
      }
      return parsedPreparation.preparation;
    }
  } finally {
    database.close();
  }

  if (!storedPreparation) {
    await clearOfflinePreparation(userId);
  }
  return null;
}

export async function updateOfflinePreparedSnapshot(userId: string, route: OfflinePreparedRoute, data: unknown) {
  const parsedData = jsonValueSchema.safeParse(data);
  if (!parsedData.success || !globalThis.indexedDB) {
    return false;
  }

  const database = await openDatabase(userId);

  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_PREPARATION.STORE, "readwrite");
      const store = transaction.objectStore(OFFLINE_PREPARATION.STORE);
      const request = store.get(OFFLINE_PREPARATION.KEY);
      let snapshotUpdated = false;

      request.onsuccess = () => {
        const storedPreparation = normalizeStoredOfflinePreparation(request.result).preparation;
        if (!storedPreparation || storedPreparation.userId !== userId || !storedPreparation.snapshots[route]) {
          return;
        }

        const expiresAt = Date.parse(storedPreparation.expiresAt);
        const sessionExpiresAt = Date.parse(storedPreparation.sessionExpiresAt);
        if (Date.now() >= expiresAt || Date.now() >= sessionExpiresAt) {
          return;
        }

        const capturedAt = new Date().toISOString();
        store.put({
          key: OFFLINE_PREPARATION.KEY,
          ...storedPreparation,
          snapshots: {
            ...storedPreparation.snapshots,
            [route]: {
              schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
              capturedAt,
              data: parsedData.data,
            },
          },
        });
        snapshotUpdated = true;
      };
      request.onerror = () => {
        reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.UPDATE_PREPARED_VIEW_FAILED));
      };
      transaction.oncomplete = () => resolve(snapshotUpdated);
      transaction.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.UPDATE_PREPARED_VIEW_FAILED));
      transaction.onabort = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.UPDATE_PREPARED_VIEW_FAILED));
    });
  } finally {
    database.close();
  }
}

export async function readOfflinePreparedDocuments(userId: string): Promise<OfflinePreparedDocument[]> {
  const preparation = await readOfflinePreparation(userId);
  if (!preparation) {
    return [];
  }

  const database = await openDatabase(userId);
  try {
    const storedDocuments = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction(OFFLINE_PREPARATION.DOCUMENTS_STORE, "readonly")
        .objectStore(OFFLINE_PREPARATION.DOCUMENTS_STORE)
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.READ_DOCUMENTS_FAILED));
    });
    const parsedDocuments = offlinePreparedDocumentsSchema.safeParse(storedDocuments);
    if (!parsedDocuments.success) {
      throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.DOCUMENT_FORMAT_UNRECOGNIZED);
    }
    return parsedDocuments.data;
  } finally {
    database.close();
  }
}

export async function readOfflinePreparedWorkspace(userId: string): Promise<OfflinePreparedWorkspace> {
  if (!globalThis.indexedDB) {
    return { preparation: null, documents: [] };
  }

  const preparation = await readOfflinePreparation(userId);
  if (!preparation) {
    return { preparation: null, documents: [] };
  }

  return { preparation, documents: await readOfflinePreparedDocuments(userId) };
}

const pendingPreparations = new Map<string, Promise<OfflinePreparation>>();

function preparationKey(userId: string, capabilities: string[], sessionExpiresAt: string) {
  return `${userId}:${[...capabilities].sort().join(",")}:${sessionExpiresAt}`;
}

function canRetryPreparation(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  if (!error.response) {
    return true;
  }

  return error.response.status >= 500 || error.response.status === 429;
}

async function prepareWithBoundedRetries(
  userId: string,
  userName: string,
  roleLabel: string,
  capabilities: string[],
  sessionExpiresAt: string,
) {
  let attempt = 0;

  while (attempt < OFFLINE_PREPARATION.PREPARATION_MAX_ATTEMPTS) {
    try {
      return await prepareOfflineWorkspaceOnce(userId, userName, roleLabel, capabilities, sessionExpiresAt);
    } catch (error) {
      attempt += 1;
      if (attempt >= OFFLINE_PREPARATION.PREPARATION_MAX_ATTEMPTS || !canRetryPreparation(error)) {
        throw error;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, OFFLINE_PREPARATION.PREPARATION_RETRY_DELAY_MS * attempt));
    }
  }

  throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.RETRIES_EXHAUSTED);
}

async function coordinateOfflinePreparation(
  userId: string,
  userName: string,
  roleLabel: string,
  capabilities: string[],
  sessionExpiresAt: string,
  forceRefresh: boolean,
) {
  async function prepareIfStale() {
    const currentPreparation = await readOfflinePreparation(userId);
    const matchesCurrentAccess = currentPreparation
      && currentPreparation.sessionExpiresAt === sessionExpiresAt
      && currentPreparation.capabilities.length === capabilities.length
      && capabilities.every((capability) => currentPreparation.capabilities.includes(capability));
    const preparedRecently = currentPreparation
      && Date.now() - Date.parse(currentPreparation.preparedAt) < OFFLINE_PREPARATION.PREPARATION_REUSE_WINDOW_MS;

    if (!forceRefresh && matchesCurrentAccess && preparedRecently) {
      return currentPreparation;
    }

    return prepareWithBoundedRetries(userId, userName, roleLabel, capabilities, sessionExpiresAt);
  }

  if (navigator.locks) {
    const lockName = `merendar-offline-preparation:${userId}`;
    const availableLock = await navigator.locks.request(lockName, { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!lock) {
        return null;
      }

      return prepareWithBoundedRetries(userId, userName, roleLabel, capabilities, sessionExpiresAt);
    });

    if (availableLock) {
      return availableLock;
    }

    return navigator.locks.request(lockName, { mode: "exclusive" }, prepareIfStale);
  }

  return prepareWithBoundedRetries(userId, userName, roleLabel, capabilities, sessionExpiresAt);
}

export function prepareOfflineWorkspace(
  userId: string,
  userName: string,
  roleLabel: string,
  capabilities: string[],
  sessionExpiresAt: string,
  forceRefresh = false,
) {
  let refreshMode = "normal";

  if (forceRefresh) {
    refreshMode = "refresh";
  }

  const key = `${preparationKey(userId, capabilities, sessionExpiresAt)}:${refreshMode}`;
  const activePreparation = pendingPreparations.get(key);

  if (activePreparation) {
    return activePreparation;
  }

  const preparation = coordinateOfflinePreparation(userId, userName, roleLabel, capabilities, sessionExpiresAt, forceRefresh);
  pendingPreparations.set(key, preparation);
  void preparation.then(
    () => pendingPreparations.delete(key),
    () => pendingPreparations.delete(key),
  );
  return preparation;
}

async function prepareOfflineWorkspaceOnce(
  userId: string,
  userName: string,
  roleLabel: string,
  capabilities: string[],
  sessionExpiresAt: string,
) {
  if (!userId || !Number.isFinite(Date.parse(sessionExpiresAt)) || Date.now() >= Date.parse(sessionExpiresAt)) {
    throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.SESSION_EXPIRED);
  }

  await cachePublicOfflineShellAssets();
  const capturedAt = new Date().toISOString();
  const snapshots: OfflinePreparation["snapshots"] = {
    [ROUTES.HOME]: {
      schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
      capturedAt,
      data: { authorized: false },
    },
  };
  if (capabilities.includes("dashboard.metrics.read")) {
    const dashboardResponse = await clientAxios.get<unknown>(API_ROUTES.DASHBOARD, { headers: NO_STORE_REQUEST_HEADERS });
    const parsedDashboard = dashboardSummaryResponseSchema.safeParse(dashboardResponse.data);

    if (!parsedDashboard.success || !parsedDashboard.data.authorized) {
      throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.DASHBOARD_METRICS_INVALID);
    }

    snapshots[ROUTES.HOME] = {
      schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
      capturedAt,
      data: parsedDashboard.data,
    };
  }
  const routeRequests: Array<{ route: keyof typeof OFFLINE_PREPARATION.ROUTE_CAPABILITIES; endpoint: string }> = [
    { route: ROUTES.FAMILIES, endpoint: API_ROUTES.FAMILIES },
    { route: ROUTES.GOODS, endpoint: API_ROUTES.MERCHANDISE },
    { route: ROUTES.DELIVERY, endpoint: `${API_ROUTES.RECORDS}?includePeriodDetails=true` },
    { route: ROUTES.USERS, endpoint: API_ROUTES.USERS },
    { route: ROUTES.ACCESS_POLICY, endpoint: API_ROUTES.ACCESS_POLICY },
  ];

  for (const request of routeRequests) {
    const requiredCapabilities = OFFLINE_PREPARATION.ROUTE_CAPABILITIES[request.route];
    if (requiredCapabilities.some((capability) => capabilities.includes(capability))) {
      const response = await clientAxios.get<unknown>(request.endpoint, { headers: NO_STORE_REQUEST_HEADERS });
      const parsedSnapshot = jsonValueSchema.safeParse(response.data);

      if (!parsedSnapshot.success) {
        throw new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.SNAPSHOT_INVALID);
      }

      snapshots[request.route] = {
        schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
        capturedAt,
        data: parsedSnapshot.data,
      };
    }
  }

  const documents = await downloadPreparedDocuments(snapshots);
  await ensurePreparationStorageCapacity(snapshots, documents);
  const preparation: OfflinePreparation = {
    schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
    userId,
    userName,
    roleLabel,
    capabilities,
    sessionExpiresAt,
    expiresAt: new Date(Math.min(Date.now() + OFFLINE_PREPARATION.MAX_AGE_HOURS * 60 * 60_000, Date.parse(sessionExpiresAt))).toISOString(),
    preparedAt: capturedAt,
    snapshots,
  };
  await savePreparation(preparation, documents);
  return preparation;
}

export async function clearOfflinePreparation(userId: string) {
  if (!globalThis.indexedDB) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.ACCOUNT_PREPARATION_CLEANUP_FAILED));
    request.onblocked = () => reject(new OfflinePreparationError(OFFLINE_PREPARATION_MESSAGES.ACCOUNT_CLEANUP_TABS));
  });
}
