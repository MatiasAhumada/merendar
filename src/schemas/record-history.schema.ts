import { z } from "zod";

const dateValueSchema = z.iso.date();

export const recordHistoryQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  family: z.string().trim().max(120).optional(),
  periodId: z.string().trim().min(1).max(80).optional(),
  from: dateValueSchema.optional(),
  to: dateValueSchema.optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict().refine((filters) => !filters.from || !filters.to || filters.from <= filters.to, {
  message: "La fecha desde no puede ser posterior a la fecha hasta.",
  path: ["from"],
});

export const recordHistoryResponseSchema = z.object({
  records: z.array(z.object({
    id: z.string(),
    periodId: z.string(),
    periodLabel: z.string(),
    familyId: z.string(),
    familyName: z.string(),
    personName: z.string(),
    dni: z.string().nullable(),
    receivedAt: z.iso.date(),
    moduleType: z.string(),
    quantity: z.number().int().positive(),
    source: z.enum(["individual", "jornada"]),
  })),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export type RecordHistoryQuery = z.infer<typeof recordHistoryQuerySchema>;
export type RecordHistoryResponse = z.infer<typeof recordHistoryResponseSchema>;
