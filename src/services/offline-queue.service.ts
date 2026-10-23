import { OFFLINE_STORAGE, SYNC_MESSAGES, SYNC_ROUTES } from "@/constants/offline.constant";
import { isOfflineOperationEnabled } from "@/constants/offline-contract.constant";
import type { JsonValue } from "@/types/json-value";
import type { OfflineOperation, OfflineOperationInput, SynchronizationResult } from "@/types/offline-operation";
import axios from "axios";
import clientAxios from "@/utils/clientAxios.util";
import { z } from "zod";

const synchronizationResultSchema = z.object({
  operationId: z.uuid(),
  resourceVersion: z.number().int().nonnegative(),
  result: z.json(),
  replayed: z.boolean(),
});

const synchronizationErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    currentVersion: z.number().int().nonnegative().optional(),
    current: z.json().optional(),
  }),
});
const offlineOperationSchema = z.object({
  operationId: z.uuid(),
  userId: z.string().min(1),
  sessionExpiresAt: z.iso.datetime(),
  resource: z.enum(["families", "remittances", "records", "renditions"]),
  resourceId: z.string().min(1),
  operation: z.enum(["create", "update", "delete"]),
  baseVersion: z.number().int().nonnegative().nullable(),
  dependencies: z.array(z.uuid()),
  payload: z.json(),
  createdAt: z.iso.datetime(),
  status: z.enum(["pending", "syncing", "synced", "error", "conflict"]),
  attempts: z.number().int().nonnegative(),
  leaseExpiresAt: z.number().nullable(),
  message: z.string().nullable(),
  remoteVersion: z.number().int().nonnegative().nullable(),
  remoteSnapshot: z.json().nullable(),
  result: z.json().nullable(),
});

export class OfflineQueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineQueueError";
  }
}

function databaseName(userId: string) {
  return `${OFFLINE_STORAGE.DATABASE_PREFIX}-${encodeURIComponent(userId)}`;
}

function openDatabase(userId: string): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new OfflineQueueError("Este navegador no admite almacenamiento offline."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(userId), OFFLINE_STORAGE.DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(OFFLINE_STORAGE.OPERATIONS_STORE)) {
        const operations = database.createObjectStore(OFFLINE_STORAGE.OPERATIONS_STORE, { keyPath: "operationId" });
        operations.createIndex("status", "status");
        operations.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new OfflineQueueError("No se pudo abrir la cola offline."));
    request.onblocked = () => reject(new OfflineQueueError("Cerrá las otras pestañas de Merendar para actualizar la cola offline."));
  });
}

function notifyQueueChange() {
  if (globalThis.window) {
    window.dispatchEvent(new CustomEvent("offline-queue-change"));
  }
}

async function ensureStorageCapacity(operation: OfflineOperationInput) {
  const requiredBytes = new TextEncoder().encode(JSON.stringify(operation)).length + OFFLINE_STORAGE.STORAGE_RESERVE_BYTES;
  const estimate = await navigator.storage?.estimate();
  const quota = estimate?.quota;
  const usage = estimate?.usage ?? 0;

  if (quota && quota - usage < requiredBytes) {
    throw new OfflineQueueError(SYNC_MESSAGES.STORAGE_FULL);
  }

  if (requiredBytes - OFFLINE_STORAGE.STORAGE_RESERVE_BYTES > OFFLINE_STORAGE.MAX_OPERATION_BYTES) {
    throw new OfflineQueueError("El cambio supera el tamaño máximo permitido para guardarse offline.");
  }
}

export async function enqueueOfflineOperation(
  userId: string,
  sessionExpiresAt: string,
  input: OfflineOperationInput,
): Promise<OfflineOperation> {
  if (!userId || !Number.isFinite(Date.parse(sessionExpiresAt)) || Date.now() >= Date.parse(sessionExpiresAt)) {
    throw new OfflineQueueError(SYNC_MESSAGES.SESSION_EXPIRED);
  }

  if (!isOfflineOperationEnabled(input.resource, input.operation)) {
    throw new OfflineQueueError("Esta acción todavía no está habilitada para guardarse offline en este módulo.");
  }

  const existingOperations = await listOfflineOperations(userId);
  const unresolvedDependency = input.dependencies.find((dependencyId) =>
    !existingOperations.some((operation) => operation.operationId === dependencyId),
  );

  if (unresolvedDependency) {
    throw new OfflineQueueError("No encontramos un cambio padre necesario para guardar este registro.");
  }

  await pruneCompletedOperations(userId);
  const retainedOperations = await listOfflineOperations(userId);
  const operationInput: OfflineOperationInput = {
    ...input,
    dependencies: input.dependencies.filter((dependencyId) =>
      retainedOperations.some((operation) => operation.operationId === dependencyId),
    ),
  };

  await ensureStorageCapacity(operationInput);
  const now = new Date().toISOString();
  const operation: OfflineOperation = {
    ...operationInput,
    operationId: crypto.randomUUID(),
    userId,
    sessionExpiresAt,
    createdAt: now,
    status: "pending",
    attempts: 0,
    leaseExpiresAt: null,
    message: null,
    remoteVersion: null,
    remoteSnapshot: null,
    result: null,
  };
  const database = await openDatabase(userId);

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_STORAGE.OPERATIONS_STORE, "readwrite");
      transaction.objectStore(OFFLINE_STORAGE.OPERATIONS_STORE).add(operation);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflineQueueError(SYNC_MESSAGES.STORAGE_FULL));
      transaction.onabort = () => reject(new OfflineQueueError(SYNC_MESSAGES.STORAGE_FULL));
    });
  } finally {
    database.close();
  }

  notifyQueueChange();
  return operation;
}

export async function listOfflineOperations(userId: string): Promise<OfflineOperation[]> {
  const database = await openDatabase(userId);
  try {
    return await new Promise<OfflineOperation[]>((resolve, reject) => {
      const request = database.transaction(OFFLINE_STORAGE.OPERATIONS_STORE, "readonly")
        .objectStore(OFFLINE_STORAGE.OPERATIONS_STORE)
        .getAll();
      request.onsuccess = () => {
        const parsedOperations = z.array(offlineOperationSchema).safeParse(request.result);

        if (!parsedOperations.success) {
          reject(new OfflineQueueError("La cola offline tiene un formato que esta versión no reconoce."));
          return;
        }

        resolve(parsedOperations.data.sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
      };
      request.onerror = () => reject(new OfflineQueueError("No se pudo leer la cola offline."));
    });
  } finally {
    database.close();
  }
}

async function pruneCompletedOperations(userId: string) {
  const database = await openDatabase(userId);

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_STORAGE.OPERATIONS_STORE, "readwrite");
      const store = transaction.objectStore(OFFLINE_STORAGE.OPERATIONS_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const parsedOperations = z.array(offlineOperationSchema).safeParse(request.result);

        if (!parsedOperations.success) {
          reject(new OfflineQueueError("La cola offline tiene un formato que esta versión no reconoce."));
          transaction.abort();
          return;
        }

        const operations = parsedOperations.data.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        const completedOperations = operations.filter((operation) => operation.status === "synced");
        const oldestRetainedAt = Date.now() - OFFLINE_STORAGE.SYNC_HISTORY_RETENTION_DAYS * 24 * 60 * 60_000;
        const historyOverflow = Math.max(0, completedOperations.length - OFFLINE_STORAGE.SYNC_HISTORY_LIMIT);
        let removedCount = 0;

        for (const operation of completedOperations) {
          const hasUnresolvedDependent = operations.some((dependentOperation) =>
            dependentOperation.status !== "synced" && dependentOperation.dependencies.includes(operation.operationId),
          );
          const exceedsRetention = Date.parse(operation.createdAt) < oldestRetainedAt;
          const exceedsLimit = removedCount < historyOverflow;

          if (!hasUnresolvedDependent && (exceedsRetention || exceedsLimit)) {
            store.delete(operation.operationId);
            removedCount += 1;
          }
        }
      };
      request.onerror = () => reject(new OfflineQueueError("No se pudo limpiar el historial sincronizado."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflineQueueError("No se pudo limpiar el historial sincronizado."));
    });
  } finally {
    database.close();
  }
}

async function updateOperation(userId: string, operationId: string, update: (operation: OfflineOperation) => OfflineOperation) {
  const database = await openDatabase(userId);

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_STORAGE.OPERATIONS_STORE, "readwrite");
      const store = transaction.objectStore(OFFLINE_STORAGE.OPERATIONS_STORE);
      const request = store.get(operationId);
      request.onsuccess = () => {
        if (request.result) {
          const parsedOperation = offlineOperationSchema.safeParse(request.result);

          if (!parsedOperation.success) {
            reject(new OfflineQueueError("La cola offline tiene un formato que esta versión no reconoce."));
            transaction.abort();
            return;
          }

          store.put(update(parsedOperation.data));
        }
      };
      request.onerror = () => reject(new OfflineQueueError("No se pudo actualizar la cola offline."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflineQueueError("No se pudo actualizar la cola offline."));
    });
  } finally {
    database.close();
  }

  notifyQueueChange();
}

async function claimNextOperation(userId: string): Promise<OfflineOperation | null> {
  const database = await openDatabase(userId);
  let claimedOperation: OfflineOperation | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OFFLINE_STORAGE.OPERATIONS_STORE, "readwrite");
      const store = transaction.objectStore(OFFLINE_STORAGE.OPERATIONS_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const parsedOperations = z.array(offlineOperationSchema).safeParse(request.result);

        if (!parsedOperations.success) {
          reject(new OfflineQueueError("La cola offline tiene un formato que esta versión no reconoce."));
          transaction.abort();
          return;
        }

        const operations = parsedOperations.data.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        const operation = operations.find((candidate) => {
          const available = candidate.status === "pending" ||
            (candidate.status === "syncing" && (candidate.leaseExpiresAt ?? 0) <= Date.now());
          const dependenciesReady = candidate.dependencies.every((dependencyId) =>
            operations.some((dependency) => dependency.operationId === dependencyId && dependency.status === "synced"),
          );
          return available && dependenciesReady;
        });

        if (operation) {
          claimedOperation = {
            ...operation,
            status: "syncing",
            attempts: operation.attempts + 1,
            leaseExpiresAt: Date.now() + OFFLINE_STORAGE.LEASE_DURATION_MS,
            message: null,
          };
          store.put(claimedOperation);
        }
      };
      request.onerror = () => reject(new OfflineQueueError("No se pudo preparar la sincronización."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new OfflineQueueError("No se pudo preparar la sincronización."));
    });
  } finally {
    database.close();
  }

  return claimedOperation;
}

async function markOperationError(userId: string, operationId: string, message: string) {
  await updateOperation(userId, operationId, (operation) => ({
    ...operation,
    status: "error",
    leaseExpiresAt: null,
    message,
  }));
}

async function markOperationConflict(
  userId: string,
  operationId: string,
  message: string,
  remoteVersion: number | null,
  remoteSnapshot: JsonValue | null,
) {
  await updateOperation(userId, operationId, (operation) => ({
    ...operation,
    status: "conflict",
    leaseExpiresAt: null,
    message,
    remoteVersion,
    remoteSnapshot,
  }));
}

async function markOperationSynced(userId: string, operationId: string, result: SynchronizationResult) {
  await updateOperation(userId, operationId, (operation) => ({
    ...operation,
    status: "synced",
    leaseExpiresAt: null,
    message: null,
    result: result.result,
  }));
}

async function sendOperation(operation: OfflineOperation): Promise<boolean> {
  if (Date.now() >= Date.parse(operation.sessionExpiresAt)) {
    await markOperationError(operation.userId, operation.operationId, SYNC_MESSAGES.SESSION_EXPIRED);
    return false;
  }

  let responseStatus: number;
  let responseBody: unknown;

  try {
    const response = await clientAxios.post<unknown>(SYNC_ROUTES.OPERATIONS, {
        operationId: operation.operationId,
        userId: operation.userId,
        resource: operation.resource,
        resourceId: operation.resourceId,
        operation: operation.operation,
        baseVersion: operation.baseVersion,
        dependencies: operation.dependencies,
        payload: operation.payload,
      }, {
        headers: { "Cache-Control": "no-cache" },
        withCredentials: true,
        timeout: 30_000,
        validateStatus: () => true,
      });
    responseStatus = response.status;
    responseBody = response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      responseStatus = error.response.status;
      responseBody = error.response.data;
    } else {
      await markOperationError(operation.userId, operation.operationId, "No se pudo contactar al servidor. El cambio sigue guardado en este dispositivo.");
      return true;
    }
  }

  if (responseStatus < 200 || responseStatus >= 300) {
    const parsedError = synchronizationErrorSchema.safeParse(responseBody);

    if (responseStatus === 409 && parsedError.success && parsedError.data.error.code === "version_conflict") {
      const remoteVersion = parsedError.data.error.currentVersion ?? null;
      const remoteSnapshot = parsedError.data.error.current ?? null;
      await markOperationConflict(operation.userId, operation.operationId, parsedError.data.error.message, remoteVersion, remoteSnapshot);
      return true;
    }

    if (responseStatus === 401) {
      await markOperationError(operation.userId, operation.operationId, SYNC_MESSAGES.SESSION_EXPIRED);
      return false;
    }

    if (responseStatus === 403) {
      await markOperationError(operation.userId, operation.operationId, SYNC_MESSAGES.PERMISSION_REVOKED);
      return false;
    }

    let message = "No se pudo sincronizar este cambio. El borrador permanece guardado.";

    if (parsedError.success) {
      message = parsedError.data.error.message;
    }

    await markOperationError(operation.userId, operation.operationId, message);
    return true;
  }

  const parsedResult = synchronizationResultSchema.safeParse(responseBody);

  if (parsedResult.success) {
    await markOperationSynced(operation.userId, operation.operationId, parsedResult.data);
    return true;
  }

  await markOperationError(operation.userId, operation.operationId, "El servidor respondió sin confirmar el resultado del cambio.");
  return true;
}

export async function synchronizeOfflineQueue(userId: string) {
  if (!navigator.onLine) {
    return;
  }

  await pruneCompletedOperations(userId);

  while (navigator.onLine) {
    const operation = await claimNextOperation(userId);

    if (!operation) {
      return;
    }

    const shouldContinue = await sendOperation(operation);

    if (!shouldContinue) {
      return;
    }
  }
}

export async function retryOfflineOperation(userId: string, operationId: string) {
  const operations = await listOfflineOperations(userId);
  const selectedOperation = operations.find((operation) => operation.operationId === operationId);

  if (!selectedOperation) {
    throw new OfflineQueueError("No encontramos el cambio que querés reintentar.");
  }

  if (selectedOperation.status !== "error") {
    throw new OfflineQueueError("Solo se pueden reintentar cambios con error.");
  }

  await updateOperation(userId, operationId, (operation) => ({ ...operation, status: "pending", message: null }));
  await synchronizeOfflineQueue(userId);
}

export async function updateOfflineOperationPayload(userId: string, operationId: string, payload: JsonValue) {
  const operations = await listOfflineOperations(userId);
  const selectedOperation = operations.find((operation) => operation.operationId === operationId);

  if (!selectedOperation || (selectedOperation.status !== "error" && selectedOperation.status !== "conflict")) {
    throw new OfflineQueueError("Solo se pueden corregir cambios con error o conflicto.");
  }

  await updateOperation(userId, operationId, (operation) => ({
    ...operation,
    payload,
    status: "pending",
    attempts: 0,
    leaseExpiresAt: null,
    message: null,
    remoteVersion: null,
    remoteSnapshot: null,
  }));
}

export async function resolveOfflineConflict(userId: string, operationId: string, resolution: "local" | "server") {
  const operations = await listOfflineOperations(userId);
  const selectedOperation = operations.find((operation) => operation.operationId === operationId);

  if (!selectedOperation || selectedOperation.status !== "conflict") {
    throw new OfflineQueueError("No encontramos el conflicto que querés resolver.");
  }

  if (resolution === "local" && !Number.isInteger(selectedOperation.remoteVersion)) {
    throw new OfflineQueueError("No recibimos la versión actual del servidor. Actualizá los datos antes de resolver el conflicto.");
  }

  if (resolution === "local") {
    const baseVersion = selectedOperation.remoteVersion;

    const replacementOperation: OfflineOperation = {
      ...selectedOperation,
      operationId: crypto.randomUUID(),
      baseVersion,
      status: "pending",
      attempts: 0,
      leaseExpiresAt: null,
      message: null,
      remoteVersion: null,
      remoteSnapshot: null,
      result: null,
      createdAt: new Date().toISOString(),
    };
    const database = await openDatabase(userId);

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(OFFLINE_STORAGE.OPERATIONS_STORE, "readwrite");
        const store = transaction.objectStore(OFFLINE_STORAGE.OPERATIONS_STORE);
        store.put({ ...selectedOperation, status: "synced", result: selectedOperation.remoteSnapshot, message: null });
        store.add(replacementOperation);
        const request = store.getAll();
        request.onsuccess = () => {
          const parsedOperations = z.array(offlineOperationSchema).safeParse(request.result);

          if (!parsedOperations.success) {
            reject(new OfflineQueueError("La cola offline tiene un formato que esta versión no reconoce."));
            transaction.abort();
            return;
          }

          for (const operation of parsedOperations.data) {
            if (operation.operationId !== selectedOperation.operationId && operation.dependencies.includes(selectedOperation.operationId)) {
              store.put({
                ...operation,
                dependencies: operation.dependencies.map((dependencyId) =>
                  dependencyId === selectedOperation.operationId ? replacementOperation.operationId : dependencyId,
                ),
              });
            }
          }
        };
        transaction.oncomplete = () => resolve();
        request.onerror = () => reject(new OfflineQueueError("No se pudo actualizar las dependencias del cambio."));
        transaction.onerror = () => reject(new OfflineQueueError("No se pudo guardar la resolución del conflicto."));
      });
    } finally {
      database.close();
    }
    notifyQueueChange();
    await synchronizeOfflineQueue(userId);
    return;
  }

  await updateOperation(userId, operationId, (operation) => ({
    ...operation,
    status: "synced",
    leaseExpiresAt: null,
    message: null,
    result: operation.remoteSnapshot,
  }));
}

export async function clearOfflineQueue(userId: string): Promise<void> {
  const database = await openDatabase(userId);
  database.close();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName(userId));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new OfflineQueueError("No se pudo limpiar la información local de esta cuenta."));
    request.onblocked = () => reject(new OfflineQueueError("Cerrá las otras pestañas de Merendar para limpiar la información local."));
  });

  notifyQueueChange();
}
