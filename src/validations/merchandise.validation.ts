import { z } from "zod";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";

const documentSchema = z.object({
  originalName: z.string().trim().min(1).max(180).refine((name) => name.toLowerCase().endsWith(".pdf"), "El comprobante debe ser un archivo PDF."),
  contentType: z.literal("application/pdf"),
  contentBase64: z.string().max(700_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict().superRefine((document, context) => {
  const paddingLength = document.contentBase64.endsWith("==") ? 2 : document.contentBase64.endsWith("=") ? 1 : 0;
  const contentByteSize = Math.floor(document.contentBase64.length * 3 / 4) - paddingLength;

  if (contentByteSize > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    context.addIssue({ code: "custom", message: "El comprobante PDF debe pesar hasta 512 KiB.", path: ["contentBase64"] });
  }
});

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

const merchandiseIdentitySchema = z.object({
  id: z.string().trim().min(1).max(80),
}).strict();

export const merchandiseUpdatePayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("period"),
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(2, "Ingresá el período").max(80),
    agency: z.string().trim().min(2, "Ingresá el organismo").max(120),
    startsAt: z.iso.date(),
    endsAt: z.iso.date(),
  }).strict().refine((period) => period.startsAt <= period.endsAt, {
    message: "La fecha de cierre debe ser posterior al inicio",
    path: ["endsAt"],
  }),
  z.object({
    kind: z.literal("request"),
    id: z.string().trim().min(1).max(80),
    requestNumber: z.string().trim().min(1, "Ingresá el número de solicitud").max(80),
    requestedAt: z.iso.date(),
    requestedQuantity: z.number().int().positive().max(100_000),
    notes: z.string().trim().max(1000).optional(),
  }).strict(),
  z.object({
    kind: z.literal("quota"),
    id: z.string().trim().min(1).max(80),
    approvedQuantity: z.number().int().positive().max(100_000),
    approvedAt: z.iso.date(),
    notes: z.string().trim().max(1000).optional(),
  }).strict(),
  z.object({
    kind: z.literal("remittance"),
    id: z.string().trim().min(1).max(80),
    remittanceNumber: z.string().trim().min(1, "Ingresá el número de remito").max(80),
    receivedAt: z.iso.date(),
    receivedQuantity: z.number().int().positive().max(100_000),
    responsibleName: z.string().trim().min(2, "Ingresá quién recibió la mercadería").max(120),
    notes: z.string().trim().max(1000).optional(),
  }).strict(),
]);

export const merchandiseCancellationPayloadSchema = z.object({
  kind: z.enum(["period", "request", "remittance"]),
  action: z.literal("cancel"),
  ...merchandiseIdentitySchema.shape,
  reason: z.string().trim().min(3, "Indicá el motivo de la anulación").max(500),
}).strict();

export const merchandiseOperationPayloadSchema = z.union([
  merchandisePayloadSchema,
  merchandiseUpdatePayloadSchema,
  merchandiseCancellationPayloadSchema,
]);

export type MerchandiseUpdatePayload = z.infer<typeof merchandiseUpdatePayloadSchema>;
export type MerchandiseCancellationPayload = z.infer<typeof merchandiseCancellationPayloadSchema>;
export type MerchandiseOperationPayload = z.infer<typeof merchandiseOperationPayloadSchema>;
