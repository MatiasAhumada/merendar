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

export function isTransportFailure(error: unknown) {
  return axios.isAxiosError(error) && !error.response;
}

export async function readOfflineSnapshot<T>(userId: string, route: OfflinePreparedRoute, schema: z.ZodType<T>): Promise<OfflineDataResult<T>> {
  const preparation = await readOfflinePreparation(userId);
  const snapshot = preparation?.snapshots[route];

  if (!snapshot) {
    throw new OfflineDataUnavailableError();
  }

  const parsedSnapshot = schema.safeParse(snapshot.data);
  if (!parsedSnapshot.success) {
    throw new OfflineDataUnavailableError("Los datos preparados no coinciden con el formato de esta vista. Conectate para actualizarlos.");
  }

  return { data: parsedSnapshot.data, source: "indexeddb", capturedAt: snapshot.capturedAt, cacheUpdated: false };
}

export async function updateOfflineSnapshot<T>(userId: string, route: OfflinePreparedRoute, data: T) {
  try {
    return await updateOfflinePreparedSnapshot(userId, route, data);
  } catch {
    return false;
  }
}

export function apiDataResult<T>(data: T, cacheUpdated: boolean): OfflineDataResult<T> {
  return { data, source: "api", capturedAt: null, cacheUpdated };
}
