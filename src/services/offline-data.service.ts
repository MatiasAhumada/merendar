import axios from "axios";
import { z } from "zod";
import type { OfflinePreparedRoute } from "@/constants/offline.constant";
import { readOfflinePreparation, updateOfflinePreparedSnapshot } from "@/services/offline-preparation.service";

export type OfflineDataSource = "api" | "indexeddb";

export interface OfflineDataResult<T> {
  data: T;
  source: OfflineDataSource;
  capturedAt: string | null;
  cacheUpdated: boolean;
}

export class OfflineDataUnavailableError extends Error {
  constructor(message = "Esta vista todavía no tiene datos preparados para esta cuenta.") {
    super(message);
    this.name = "OfflineDataUnavailableError";
  }
}

function isTransportFailure(error: unknown) {
  return axios.isAxiosError(error) && !error.response;
}

async function readPreparedData<T>(userId: string, route: OfflinePreparedRoute, schema: z.ZodType<T>) {
  const preparation = await readOfflinePreparation(userId);
  const snapshot = preparation?.snapshots[route];

  if (!snapshot) {
    throw new OfflineDataUnavailableError();
  }

  const parsedData = schema.safeParse(snapshot.data);
  if (!parsedData.success) {
    throw new OfflineDataUnavailableError("Los datos preparados no coinciden con el formato de esta vista. Conectate para actualizarlos.");
  }

  return { data: parsedData.data, capturedAt: snapshot.capturedAt };
}

export async function resolveOfflineData<T>({
  userId,
  route,
  isOnline,
  schema,
  loadFromApi,
  persistToSnapshot = true,
}: {
  userId: string;
  route: OfflinePreparedRoute;
  isOnline: boolean;
  schema: z.ZodType<T>;
  loadFromApi: () => Promise<unknown>;
  persistToSnapshot?: boolean;
}): Promise<OfflineDataResult<T>> {
  if (!isOnline) {
    const preparedData = await readPreparedData(userId, route, schema);
    return { ...preparedData, source: "indexeddb", cacheUpdated: false };
  }

  try {
    const responseData = await loadFromApi();
    const parsedData = schema.safeParse(responseData);
    if (!parsedData.success) {
      throw new Error("El servidor devolvió datos que esta vista no reconoce.");
    }

    let cacheUpdated = false;
    if (persistToSnapshot) {
      try {
        cacheUpdated = await updateOfflinePreparedSnapshot(userId, route, parsedData.data);
      } catch {
        cacheUpdated = false;
      }
    }

    return { data: parsedData.data, source: "api", capturedAt: null, cacheUpdated };
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    const preparedData = await readPreparedData(userId, route, schema);
    return { ...preparedData, source: "indexeddb", cacheUpdated: false };
  }
}
