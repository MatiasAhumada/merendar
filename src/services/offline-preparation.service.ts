import { z } from "zod";
import axios from "axios";
import { OFFLINE_PREPARATION } from "@/constants/offline.constant";
import clientAxios from "@/utils/clientAxios.util";
import type { JsonValue } from "@/types/json-value";
import { dashboardSummaryResponseSchema } from "@/validations/dashboard.validation";

const offlineSnapshotSchema = z.object({
  schemaVersion: z.literal(OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION),
  capturedAt: z.iso.datetime(),
  data: z.json(),
});
const offlinePreparationSchema = z.object({
  schemaVersion: z.literal(OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION),
  userId: z.string().min(1),
  userName: z.string().min(1),
  roleLabel: z.string().min(1),
  capabilities: z.array(z.string()),
  sessionExpiresAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  preparedAt: z.iso.datetime(),
  snapshots: z.record(z.string(), offlineSnapshotSchema),
});
const legacyOfflinePreparationSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  roleLabel: z.string().min(1),
  capabilities: z.array(z.string()),
  sessionExpiresAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  preparedAt: z.iso.datetime(),
  snapshots: z.record(z.string(), z.json()),
});
const previousOfflineSnapshotSchema = z.object({
  schemaVersion: z.literal(3),
  capturedAt: z.iso.datetime(),
  data: z.json(),
});
const previousOfflinePreparationSchema = z.object({
  schemaVersion: z.literal(3),
  userId: z.string().min(1),
  userName: z.string().min(1),
  roleLabel: z.string().min(1),
  capabilities: z.array(z.string()),
  sessionExpiresAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  preparedAt: z.iso.datetime(),
  snapshots: z.record(z.string(), previousOfflineSnapshotSchema),
});
const offlinePreparedDocumentSchema = z.object({
  id: z.string().min(1),
  originalName: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  content: z.instanceof(Blob),
  documentType: z.enum(["merchandise", "rendition", "beneficiary-sheet", "beneficiary-sheet-local"]).optional(),
});
const merchandiseDocumentUrl = (documentId: string) => `/api/merchandise/documents/${encodeURIComponent(documentId)}`;
const renditionDocumentUrl = (documentId: string) => `/api/renditions/documents/${encodeURIComponent(documentId)}`;
const beneficiarySheetCollectionSchema = z.object({
  sheets: z.array(z.object({
    id: z.string().min(1),
    periodId: z.string().min(1),
    version: z.number().int().positive(),
  })),
});

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
    return Promise.reject(new OfflinePreparationError("Este navegador no admite preparación offline."));
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
    request.onerror = () => reject(new OfflinePreparationError("No se pudo abrir la preparación offline."));
    request.onblocked = () => reject(new OfflinePreparationError("Cerrá las otras pestañas de Merendar para actualizar la preparación offline."));
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
    request.onerror = () => reject(new OfflinePreparationError("No se pudo actualizar la cuenta activa del dispositivo."));
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
      transaction.onerror = () => reject(new OfflinePreparationError("No se pudo actualizar la cuenta activa del dispositivo."));
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
        const accountId = z.object({ userId: z.string().min(1) }).safeParse(request.result);
        resolve(accountId.success ? accountId.data.userId : null);
      };
      request.onerror = () => reject(new OfflinePreparationError("No se pudo leer la cuenta activa del dispositivo."));
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
      transaction.onerror = () => reject(new OfflinePreparationError("No se pudo limpiar la cuenta activa del dispositivo."));
    });
  } finally {
    database.close();
  }
}

async function cachePublicOfflineShellAssets() {
  const shellResponse = await clientAxios.get<string>("/offline", {
    responseType: "text",
    headers: { "Cache-Control": "no-store" },
  });
  const initialAssets = [...shellResponse.data.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((assetPath) => assetPath.startsWith("/_next/static/"));
  const assetsToCache = new Set(initialAssets);

  for (const assetPath of initialAssets) {
    if (assetPath.endsWith(".css")) {
      const stylesheetResponse = await clientAxios.get<string>(assetPath, { responseType: "text", headers: { "Cache-Control": "no-store" } });
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
    headers: { "Cache-Control": "no-store" },
  })));
}

function collectDocumentReferences(value: JsonValue, references: OfflineDocumentReference[]) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDocumentReferences(entry, references);
    }
    return;
  }

  const parsedObject = z.record(z.string(), z.json()).safeParse(value);
  if (!parsedObject.success) {
    return;
  }

  const documentId = z.string().min(1).safeParse(parsedObject.data.id);
  const originalName = z.string().min(1).safeParse(parsedObject.data.originalName);
  const contentType = z.string().min(1).safeParse(parsedObject.data.contentType);
  const documentType = z.enum(["PLANILLA_FIRMADA", "REMITO", "RESPALDO"]).safeParse(parsedObject.data.documentType);

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
    throw new OfflinePreparationError("El servidor devolvió planillas con un formato que no se puede preparar.");
  }

  for (const sheet of parsedCollection.data.sheets) {
    references.push({
      id: sheet.id,
      originalName: `planilla-${sheet.periodId}-v${sheet.version}.pdf`,
      url: `/api/records/sheets/${encodeURIComponent(sheet.id)}`,
      documentType: "beneficiary-sheet",
    });
  }
}

function collectPreparedDocumentReferences(snapshots: OfflinePreparation["snapshots"]) {
  const documentReferences: OfflineDocumentReference[] = [];

  for (const snapshot of Object.values(snapshots)) {
    collectDocumentReferences(snapshot.data, documentReferences);
  }

  const recordsSnapshot = snapshots["/entrega"];
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
    const response = await clientAxios.get<Blob>(reference.url, { responseType: "blob", headers: { "Cache-Control": "no-store" } });
    const content = response.data;

    if (content.size > OFFLINE_PREPARATION.MAX_DOCUMENT_BYTES) {
      throw new OfflinePreparationError(`El documento ${reference.originalName} supera el tamaño permitido para preparación offline.`);
    }

    totalByteSize += content.size;
    if (totalByteSize > OFFLINE_PREPARATION.MAX_DOCUMENTS_TOTAL_BYTES) {
      throw new OfflinePreparationError("Los documentos autorizados superan el espacio disponible para la preparación offline.");
    }

    const contentType = response.headers["content-type"];
    documents.push({
      id: reference.id,
      originalName: reference.originalName,
      contentType: z.string().min(1).parse(contentType),
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
    throw new OfflinePreparationError("No hay espacio suficiente para guardar las vistas y documentos privados sin conexión.");
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
        const existingDocuments = z.array(offlinePreparedDocumentSchema).safeParse(existingDocumentsRequest.result);
        documentStore.clear();
        const localSheetDocuments = existingDocuments.success
          ? existingDocuments.data
            .filter((document) => document.documentType === "beneficiary-sheet-local")
            .map((document) => document.id.startsWith("local:") ? document : { ...document, id: `local:${document.id}` })
          : [];
        for (const document of [...documents, ...localSheetDocuments]) {
          documentStore.put(document);
        }
      };
      existingDocumentsRequest.onerror = () => {
        reject(new OfflinePreparationError("No se pudieron conservar las planillas locales pendientes."));
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError("No se pudo guardar la preparación offline."));
      transaction.onabort = () => reject(new OfflinePreparationError("No se pudo guardar la preparación offline."));
    });
  } finally {
    database.close();
  }
}

export async function saveOfflinePreparedDocument(userId: string, document: OfflinePreparedDocument) {
  const parsedDocument = offlinePreparedDocumentSchema.safeParse(document);
  if (!parsedDocument.success || parsedDocument.data.byteSize > OFFLINE_PREPARATION.MAX_DOCUMENT_BYTES) {
    throw new OfflinePreparationError("La planilla local no tiene un formato o tamaño permitido.");
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
    throw new OfflinePreparationError("No hay espacio suficiente para guardar el PDF en este dispositivo.");
  }
  const storageEstimate = await navigator.storage?.estimate();
  if (storageEstimate?.quota && storageEstimate.quota - (storageEstimate.usage ?? 0) < parsedDocument.data.byteSize + OFFLINE_PREPARATION.STORAGE_RESERVE_BYTES) {
    throw new OfflinePreparationError("No hay espacio suficiente para guardar el PDF en este dispositivo.");
  }

  const database = await openDatabase(userId);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_PREPARATION.DOCUMENTS_STORE, "readwrite");
      transaction.objectStore(OFFLINE_PREPARATION.DOCUMENTS_STORE).put(parsedDocument.data);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError("No se pudo guardar la planilla local."));
      transaction.onabort = () => reject(new OfflinePreparationError("No se pudo guardar la planilla local."));
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
      transaction.onerror = () => reject(new OfflinePreparationError("No se pudo retirar el borrador local incompleto."));
      transaction.onabort = () => reject(new OfflinePreparationError("No se pudo retirar el borrador local incompleto."));
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
      transaction.onerror = () => reject(new OfflinePreparationError("No se pudo actualizar el formato de la preparación offline."));
      transaction.onabort = () => reject(new OfflinePreparationError("No se pudo actualizar el formato de la preparación offline."));
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
      request.onerror = () => reject(new OfflinePreparationError("No se pudo leer la preparación offline."));
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
      request.onerror = () => reject(new OfflinePreparationError("No se pudieron leer los documentos preparados."));
    });
    const parsedDocuments = z.array(offlinePreparedDocumentSchema).safeParse(storedDocuments);
    if (!parsedDocuments.success) {
      throw new OfflinePreparationError("Los documentos preparados tienen un formato que esta versión no reconoce.");
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

  throw new OfflinePreparationError("No se pudo completar la preparación automática después de varios intentos.");
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
  const key = `${preparationKey(userId, capabilities, sessionExpiresAt)}:${forceRefresh ? "refresh" : "normal"}`;
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
    throw new OfflinePreparationError("La sesión venció. Conectate de nuevo para preparar el acceso offline.");
  }

  await cachePublicOfflineShellAssets();
  const capturedAt = new Date().toISOString();
  const snapshots: OfflinePreparation["snapshots"] = {
    "/": {
      schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
      capturedAt,
      data: { authorized: false },
    },
  };
  if (capabilities.includes("dashboard.metrics.read")) {
    const dashboardResponse = await clientAxios.get<unknown>("/api/dashboard", { headers: { "Cache-Control": "no-store" } });
    const parsedDashboard = dashboardSummaryResponseSchema.safeParse(dashboardResponse.data);

    if (!parsedDashboard.success || !parsedDashboard.data.authorized) {
      throw new OfflinePreparationError("No se pudieron validar las métricas autorizadas para el inicio.");
    }

    snapshots["/"] = {
      schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
      capturedAt,
      data: parsedDashboard.data,
    };
  }
  const routeRequests: Array<{ route: keyof typeof OFFLINE_PREPARATION.ROUTE_CAPABILITIES; endpoint: string }> = [
    { route: "/familias", endpoint: "/api/families" },
    { route: "/mercaderia", endpoint: "/api/merchandise" },
    { route: "/entrega", endpoint: "/api/records?includePeriodDetails=true" },
    { route: "/usuarios", endpoint: "/api/users" },
    { route: "/permisos", endpoint: "/api/access-policy" },
  ];

  for (const request of routeRequests) {
    const requiredCapabilities = OFFLINE_PREPARATION.ROUTE_CAPABILITIES[request.route];
    if (requiredCapabilities.some((capability) => capabilities.includes(capability))) {
      const response = await clientAxios.get<unknown>(request.endpoint, { headers: { "Cache-Control": "no-store" } });
      const parsedSnapshot = z.json().safeParse(response.data);

      if (!parsedSnapshot.success) {
        throw new OfflinePreparationError("El servidor devolvió datos que no se pudieron guardar de forma segura.");
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
    request.onerror = () => reject(new OfflinePreparationError("No se pudo limpiar la preparación local de esta cuenta."));
    request.onblocked = () => reject(new OfflinePreparationError("Cerrá las otras pestañas de Merendar para limpiar la preparación local."));
  });
}
