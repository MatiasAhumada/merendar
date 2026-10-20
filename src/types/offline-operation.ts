import type { JsonValue } from "@/types/json-value";

export type SyncResource = "families" | "remittances" | "records";
export type SyncOperationStatus = "pending" | "syncing" | "synced" | "error" | "conflict";

export interface OfflineOperationInput {
  resource: SyncResource;
  resourceId: string;
  operation: "create" | "update" | "delete";
  baseVersion: number | null;
  dependencies: string[];
  payload: JsonValue;
}

export interface OfflineOperation extends OfflineOperationInput {
  operationId: string;
  userId: string;
  sessionExpiresAt: string;
  createdAt: string;
  status: SyncOperationStatus;
  attempts: number;
  leaseExpiresAt: number | null;
  message: string | null;
  remoteVersion: number | null;
  remoteSnapshot: JsonValue | null;
  result: JsonValue | null;
}

export interface SynchronizationResult {
  operationId: string;
  resourceVersion: number;
  result: JsonValue;
  replayed: boolean;
}
