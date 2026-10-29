import { z } from "zod";

export const familyErrorResponseSchema = z.object({ error: z.object({ message: z.string(), details: z.record(z.string(), z.array(z.string())).optional() }) });
export const familySynchronizationResponseSchema = z.object({
  operationId: z.uuid(),
  resourceVersion: z.number(),
  replayed: z.boolean(),
  result: z.object({ resourceId: z.string(), name: z.string() }),
});
export const familySynchronizationErrorSchema = z.object({ error: z.object({ code: z.string() }) });
