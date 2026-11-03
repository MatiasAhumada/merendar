import type { Prisma } from "@prisma/client";
import type { OfflineOperationInput } from "@/types/offline-operation";
import type { JsonObject, JsonValue } from "@/types/json-value";
import type { StoredDocumentReference } from "@/interfaces/document-storage.interface";
import type { RenditionEmissionSnapshot } from "@/interfaces/rendition.interface";

export interface SubmittedSyncOperation extends OfflineOperationInput {
  operationId: string;
  userId: string;
  attachments?: ReadonlyMap<string, Uint8Array>;
  preparedStorageObjects?: ReadonlyMap<string, StoredDocumentReference>;
  preparedMerchandiseRequestDocument?: { version: number; requestVersion: number; originalName: string; storedObject: StoredDocumentReference };
  preparedEmission?: {
    snapshot: RenditionEmissionSnapshot;
    notePdf: Uint8Array;
    summaryPdf: Uint8Array;
    packagePdf: Uint8Array;
    storedFiles: { note: StoredDocumentReference; summary: StoredDocumentReference; packageFile: StoredDocumentReference };
    sourceFingerprint: string;
  };
}

export type SyncHandlerResult =
  | { type: "synchronized"; resourceVersion: number; result: JsonObject }
  | { type: "conflict"; resourceVersion: number; current: JsonValue };

export interface SynchronizationHandler {
  prepare?(operation: SubmittedSyncOperation): Promise<SubmittedSyncOperation>;
  apply(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation): Promise<SyncHandlerResult>;
}

export interface SynchronizationResponse {
  operationId: string;
  resourceVersion: number;
  result: JsonValue;
  replayed: boolean;
}
