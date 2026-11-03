import { jsonValueSchema, nonNegativeIntegerSchema } from "@/schemas/offline.schema";
import { z } from "zod";

export const synchronizationRequestSchema = z.object({
  operationId: z.uuid(),
  userId: z.string().min(1),
  resource: z.enum(["families", "remittances", "records", "renditions"]),
  resourceId: z.string().min(1),
  operation: z.enum(["create", "update", "delete"]),
  baseVersion: nonNegativeIntegerSchema.nullable(),
  dependencies: z.array(z.uuid()).max(100),
  payload: jsonValueSchema,
}).strict();

export const serializationConflictSchema = z.object({
  cause: z.object({ originalCode: z.literal("40001") }).passthrough(),
});
export const currentRecordSchema = z.record(z.string(), jsonValueSchema);
export const beneficiaryCountSchema = z.object({ beneficiaries: z.array(z.unknown()) });
