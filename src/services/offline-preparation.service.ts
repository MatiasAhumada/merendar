import { z } from "zod";
import { OFFLINE_PREPARATION } from "@/constants/offline.constant";
import clientAxios from "@/utils/clientAxios.util";
import type { JsonValue } from "@/types/json-value";

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
const offlinePreparedDocumentSchema = z.object({
  id: z.string().min(1),
  originalName: z.string().min(1),
  contentType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  content: z.instanceof(Blob),
});
const merchandiseDocumentUrl = (documentId: string) => `/api/merchandise/documents/${encodeURIComponent(documentId)}`;
const renditionDocumentUrl = (documentId: string) => `/api/renditions/documents/${encodeURIComponent(documentId)}`;

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
    references.push({ id: documentId.data, originalName: originalName.data, url: merchandiseDocumentUrl(documentId.data) });
  }

  if (documentId.success && originalName.success && documentType.success) {
    references.push({ id: documentId.data, originalName: originalName.data, url: renditionDocumentUrl(documentId.data) });
  }

  for (const nestedValue of Object.values(parsedObject.data)) {
    collectDocumentReferences(nestedValue, references);
  }
}

async function downloadPreparedDocuments(snapshots: OfflinePreparation["snapshots"]) {
  const documentReferences: OfflineDocumentReference[] = [];
  for (const snapshot of Object.values(snapshots)) {
    collectDocumentReferences(snapshot.data, documentReferences);
  }

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
      documentStore.clear();
      for (const document of documents) {
        documentStore.put(document);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflinePreparationError("No se pudo guardar la preparación offline."));
      transaction.onabort = () => reject(new OfflinePreparationError("No se pudo guardar la preparación offline."));
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

export async function prepareOfflineWorkspace(
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
      data: { status: "prepared" },
    },
  };
  const routeRequests: Array<{ route: string; endpoint: string; capabilities: string[] }> = [
    { route: "/familias", endpoint: "/api/families", capabilities: ["families.read"] },
    { route: "/mercaderia", endpoint: "/api/merchandise", capabilities: ["merchandise.read", "renditions.read"] },
    { route: "/entrega", endpoint: "/api/records", capabilities: ["delivery.read"] },
    { route: "/usuarios", endpoint: "/api/users", capabilities: ["users.manage"] },
    { route: "/permisos", endpoint: "/api/access-policy", capabilities: ["access-policy.manage"] },
  ];

  for (const request of routeRequests) {
    if (request.capabilities.some((capability) => capabilities.includes(capability))) {
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
