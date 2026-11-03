

import { OFFLINE_OPERATION_MESSAGES, SYNC_SERVER_MESSAGES } from "@/constants/offline.constant";
import type { z } from "zod";
import { readOfflinePreparation, updateOfflinePreparedSnapshot } from "@/services/offline-preparation.service";
import axios from "axios";

import type { OfflinePreparedRoute } from "@/constants/offline.constant";

export type OfflineDataSource = "api" | "indexeddb";

export interface OfflineDataResult<T> {
  data: T;
  source: OfflineDataSource;
  capturedAt: string | null;
  cacheUpdated: boolean;
}

export class OfflineDataUnavailableError extends Error {
  constructor(message: string = OFFLINE_OPERATION_MESSAGES.ESTA_VISTA_TODAVIA_NO_TIENE_DATOS_PREPARADOS_PARA_ESTA_CUENTA) {
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
    throw new OfflineDataUnavailableError(SYNC_SERVER_MESSAGES.LOS_DATOS_PREPARADOS_NO_COINCIDEN_CON_EL_FORMATO_DE_ESTA_VISTA_CONECTATE_P);
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
