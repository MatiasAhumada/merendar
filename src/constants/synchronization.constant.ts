import type { AccessCapability, SyncResource as PrismaSyncResource } from "@prisma/client";
import type { SyncResource } from "@/types/offline-operation";

export const PRISMA_RESOURCE_BY_CLIENT_RESOURCE: Record<SyncResource, PrismaSyncResource> = {
  families: "FAMILIES",
  remittances: "REMITTANCES",
  records: "RECORDS",
  renditions: "RENDITIONS",
};

export const CAPABILITY_BY_SYNC_RESOURCE: Record<PrismaSyncResource, AccessCapability> = {
  FAMILIES: "FAMILIES_WRITE",
  REMITTANCES: "MERCHANDISE_WRITE",
  RECORDS: "DELIVERY_WRITE",
  RENDITIONS: "RENDITIONS_WRITE",
};
