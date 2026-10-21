import type { Prisma } from "@prisma/client";
import type { OfflineOperationInput } from "@/types/offline-operation";
import type { JsonObject, JsonValue } from "@/types/json-value";

export interface SubmittedSyncOperation extends OfflineOperationInput {
  operationId: string;
  userId: string;
}

export type SyncHandlerResult =
  | { type: "synchronized"; resourceVersion: number; result: JsonObject }
  | { type: "conflict"; resourceVersion: number; current: JsonValue };

export interface SynchronizationHandler {
  apply(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation): Promise<SyncHandlerResult>;
}

export interface SynchronizationResponse {
  operationId: string;
  resourceVersion: number;
  result: JsonValue;
  replayed: boolean;
}
