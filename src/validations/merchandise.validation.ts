import { z } from "zod";

const documentSchema = z.object({
  originalName: z.string().trim().min(1).max(180),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  contentBase64: z.string().max(700_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();

const periodPayloadSchema = z.object({
  kind: z.literal("period"),
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2, "Ingresá el período").max(80),
  agency: z.string().trim().min(2, "Ingresá el organismo").max(120),
  startsAt: z.iso.date(),
  endsAt: z.iso.date(),
}).strict().refine((period) => period.startsAt <= period.endsAt, {
  message: "La fecha de cierre debe ser posterior al inicio",
  path: ["endsAt"],
});

const requestPayloadSchema = z.object({
  kind: z.literal("request"),
  id: z.string().trim().min(1).max(80),
  periodId: z.string().trim().min(1).max(80),
  requestNumber: z.string().trim().min(1, "Ingresá el número de solicitud").max(80),
  requestedAt: z.iso.date(),
  requestedQuantity: z.number().int().positive().max(100_000),
  notes: z.string().trim().max(1000).optional(),
  document: documentSchema.optional(),
}).strict();

const quotaPayloadSchema = z.object({
  kind: z.literal("quota"),
  id: z.string().trim().min(1).max(80),
  requestId: z.string().trim().min(1).max(80),
  approvedQuantity: z.number().int().positive().max(100_000),
  approvedAt: z.iso.date(),
  notes: z.string().trim().max(1000).optional(),
  document: documentSchema.optional(),
}).strict();

const remittancePayloadSchema = z.object({
  kind: z.literal("remittance"),
  id: z.string().trim().min(1).max(80),
  requestId: z.string().trim().min(1).max(80),
  quotaId: z.string().trim().min(1).max(80),
  remittanceNumber: z.string().trim().min(1, "Ingresá el número de remito").max(80),
  receivedAt: z.iso.date(),
  receivedQuantity: z.number().int().positive().max(100_000),
  responsibleName: z.string().trim().min(2, "Ingresá quién recibió la mercadería").max(120),
  notes: z.string().trim().max(1000).optional(),
  document: documentSchema.optional(),
}).strict();

export const merchandisePayloadSchema = z.discriminatedUnion("kind", [
  periodPayloadSchema,
  requestPayloadSchema,
  quotaPayloadSchema,
  remittancePayloadSchema,
]);

export type MerchandisePayload = z.infer<typeof merchandisePayloadSchema>;
