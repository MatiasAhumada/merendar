import { createHash } from "node:crypto";
import type { SyncResource } from "@prisma/client";
import type { SynchronizationHandler, SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { synchronizationRepository } from "@/server/repository/synchronization.repository";
import type { JsonValue } from "@/types/json-value";

function hashOperation(operation: SubmittedSyncOperation) {
  const canonicalOperation: JsonValue = {
    resource: operation.resource,
    resourceId: operation.resourceId,
    operation: operation.operation,
    baseVersion: operation.baseVersion,
    dependencies: operation.dependencies,
    payload: operation.payload,
  };

  return createHash("sha256").update(JSON.stringify(canonicalOperation)).digest("hex");
}

export const synchronizationService = {
  apply(operation: SubmittedSyncOperation, resource: SyncResource, handler: SynchronizationHandler) {
    return synchronizationRepository.applyIdempotently(operation, resource, hashOperation(operation), handler);
  },
};

export function createSynchronizationHandlers(): Partial<Record<SyncResource, SynchronizationHandler>> {
  return {};
}
