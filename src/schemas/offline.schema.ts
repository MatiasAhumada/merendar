import { OFFLINE_PREPARATION } from "@/constants/offline.constant";
import { z } from "zod";

export const jsonValueSchema = z.json();
export const nullableSchema = z.null();
export const nonNegativeIntegerSchema = z.number().int().nonnegative();
export const nonEmptyStringSchema = z.string().min(1);
export const offlineSnapshotSchema = z.object({
  schemaVersion: z.literal(OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION),
  capturedAt: z.iso.datetime(),
  data: jsonValueSchema,
});
export const offlinePreparationSchema = z.object({
  schemaVersion: z.literal(OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION),
  userId: nonEmptyStringSchema,
  userName: nonEmptyStringSchema,
  roleLabel: nonEmptyStringSchema,
  capabilities: z.array(z.string()),
  sessionExpiresAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  preparedAt: z.iso.datetime(),
  snapshots: z.record(z.string(), offlineSnapshotSchema),
});
export const legacyOfflinePreparationSchema = z.object({
  userId: nonEmptyStringSchema,
  userName: nonEmptyStringSchema,
  roleLabel: nonEmptyStringSchema,
  capabilities: z.array(z.string()),
  sessionExpiresAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  preparedAt: z.iso.datetime(),
  snapshots: z.record(z.string(), jsonValueSchema),
});
export const previousOfflineSnapshotSchema = z.object({
  schemaVersion: z.literal(3),
  capturedAt: z.iso.datetime(),
  data: jsonValueSchema,
});
export const previousOfflinePreparationSchema = z.object({
  schemaVersion: z.literal(3),
  userId: nonEmptyStringSchema,
  userName: nonEmptyStringSchema,
  roleLabel: nonEmptyStringSchema,
  capabilities: z.array(z.string()),
  sessionExpiresAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  preparedAt: z.iso.datetime(),
  snapshots: z.record(z.string(), previousOfflineSnapshotSchema),
});
export const offlinePreparedDocumentSchema = z.object({
  id: nonEmptyStringSchema,
  originalName: nonEmptyStringSchema,
  contentType: nonEmptyStringSchema,
  byteSize: nonNegativeIntegerSchema,
  content: z.instanceof(Blob),
  documentType: z.enum(["merchandise", "rendition", "beneficiary-sheet", "beneficiary-sheet-local"]).optional(),
});
export const beneficiarySheetCollectionSchema = z.object({
  sheets: z.array(z.object({
    id: nonEmptyStringSchema,
    periodId: nonEmptyStringSchema,
    version: z.number().int().positive(),
  })),
});
export const offlineAccountSchema = z.object({ userId: nonEmptyStringSchema });
export const jsonRecordSchema = z.record(z.string(), jsonValueSchema);
export const documentTypeSchema = z.enum(["PLANILLA_FIRMADA", "REMITO", "RESPALDO"]);
export const offlinePreparedDocumentsSchema = z.array(offlinePreparedDocumentSchema);
export const jsonValuesSchema = z.array(jsonValueSchema);
export const jsonStringSchema = z.string();

export const offlineOperationSchema = z.object({
  operationId: z.uuid(),
  userId: nonEmptyStringSchema,
  sessionExpiresAt: z.iso.datetime(),
  resource: z.enum(["families", "remittances", "records", "renditions"]),
  resourceId: nonEmptyStringSchema,
  operation: z.enum(["create", "update", "delete"]),
  baseVersion: nonNegativeIntegerSchema.nullable(),
  dependencies: z.array(z.uuid()),
  payload: jsonValueSchema,
  createdAt: z.iso.datetime(),
  status: z.enum(["pending", "syncing", "synced", "error", "conflict"]),
  attempts: nonNegativeIntegerSchema,
  leaseExpiresAt: z.number().nullable(),
  message: z.string().nullable(),
  remoteVersion: nonNegativeIntegerSchema.nullable(),
  remoteSnapshot: jsonValueSchema.nullable(),
  result: jsonValueSchema.nullable(),
});
export const offlineOperationsSchema = z.array(offlineOperationSchema);
export const synchronizationResultSchema = z.object({
  operationId: z.uuid(),
  resourceVersion: nonNegativeIntegerSchema,
  result: jsonValueSchema,
  replayed: z.boolean(),
});
export const synchronizationErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    currentVersion: nonNegativeIntegerSchema.optional(),
    current: jsonValueSchema.optional(),
  }),
});

export const duplicateDniSnapshotSchema = z.object({
  kind: z.literal("duplicate_dni"),
  person: z.object({
    firstName: z.string(),
    lastName: z.string(),
    dni: z.string().nullable(),
    families: z.array(z.object({ name: z.string(), neighborhood: z.string(), address: z.string() })),
  }),
});
