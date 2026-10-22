import type { SyncResource } from "@/types/offline-operation";

export type OfflineOperationKind = "create" | "update" | "delete";

export const OFFLINE_ENABLED_OPERATIONS = {
  families: ["create"],
  remittances: ["create"],
  records: ["create"],
  renditions: ["create"],
} as const satisfies Record<SyncResource, readonly OfflineOperationKind[]>;

export function isOfflineOperationEnabled(resource: SyncResource, operation: OfflineOperationKind) {
  const enabledOperations: readonly OfflineOperationKind[] = OFFLINE_ENABLED_OPERATIONS[resource];
  return enabledOperations.includes(operation);
}
