import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { z } from "zod";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import { MERCHANDISE_LIMITS, MERCHANDISE_VALIDATION_MESSAGES } from "@/constants/merchandise.constant";

const documentSchema = z.object({
  originalName: z.string().trim().min(1).max(MERCHANDISE_LIMITS.DOCUMENT_NAME_MAX_LENGTH).refine((name) => name.toLowerCase().endsWith(".pdf"), MERCHANDISE_VALIDATION_MESSAGES.PDF_REQUIRED),
  contentType: z.literal(HTTP_CONTENT_TYPES.PDF),
  contentBase64: z.string().max(700_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict().superRefine((document, context) => {
  const paddingLength = document.contentBase64.endsWith("==") ? 2 : document.contentBase64.endsWith("=") ? 1 : 0;
  const contentByteSize = Math.floor(document.contentBase64.length * 3 / 4) - paddingLength;

  if (contentByteSize > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    context.addIssue({ code: "custom", message: MERCHANDISE_VALIDATION_MESSAGES.PDF_SIZE_LIMIT, path: ["contentBase64"] });
  }
});

const periodPayloadSchema = z.object({
  kind: z.literal("period"),
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(MERCHANDISE_LIMITS.PERIOD_LABEL_MIN_LENGTH, MERCHANDISE_VALIDATION_MESSAGES.PERIOD_REQUIRED).max(MERCHANDISE_LIMITS.PERIOD_LABEL_MAX_LENGTH),
  agency: z.string().trim().min(MERCHANDISE_LIMITS.AGENCY_MIN_LENGTH, MERCHANDISE_VALIDATION_MESSAGES.AGENCY_REQUIRED).max(MERCHANDISE_LIMITS.AGENCY_MAX_LENGTH),
  startsAt: z.iso.date(),
  endsAt: z.iso.date(),
}).strict().refine((period) => period.startsAt <= period.endsAt, {
  message: MERCHANDISE_VALIDATION_MESSAGES.PERIOD_END_BEFORE_START,
  path: ["endsAt"],
});

const requestPayloadSchema = z.object({
  kind: z.literal("request"),
  id: z.string().trim().min(1).max(80),
  periodId: z.string().trim().min(1).max(80),
  requestNumber: z.string().trim().min(1, MERCHANDISE_VALIDATION_MESSAGES.REQUEST_NUMBER_REQUIRED).max(MERCHANDISE_LIMITS.REQUEST_NUMBER_MAX_LENGTH),
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
  remittanceNumber: z.string().trim().min(1, MERCHANDISE_VALIDATION_MESSAGES.REMITTANCE_NUMBER_REQUIRED).max(MERCHANDISE_LIMITS.REMITTANCE_NUMBER_MAX_LENGTH),
  receivedAt: z.iso.date(),
  receivedQuantity: z.number().int().positive().max(100_000),
  responsibleName: z.string().trim().min(MERCHANDISE_LIMITS.RESPONSIBLE_NAME_MIN_LENGTH, MERCHANDISE_VALIDATION_MESSAGES.RESPONSIBLE_REQUIRED).max(MERCHANDISE_LIMITS.RESPONSIBLE_NAME_MAX_LENGTH),
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
    label: z.string().trim().min(MERCHANDISE_LIMITS.PERIOD_LABEL_MIN_LENGTH, MERCHANDISE_VALIDATION_MESSAGES.PERIOD_REQUIRED).max(MERCHANDISE_LIMITS.PERIOD_LABEL_MAX_LENGTH),
    agency: z.string().trim().min(2, MERCHANDISE_VALIDATION_MESSAGES.AGENCY_REQUIRED).max(MERCHANDISE_LIMITS.AGENCY_MAX_LENGTH),
    startsAt: z.iso.date(),
    endsAt: z.iso.date(),
  }).strict().refine((period) => period.startsAt <= period.endsAt, {
    message: MERCHANDISE_VALIDATION_MESSAGES.PERIOD_END_BEFORE_START,
    path: ["endsAt"],
  }),
  z.object({
    kind: z.literal("request"),
    id: z.string().trim().min(1).max(80),
    requestNumber: z.string().trim().min(1, MERCHANDISE_VALIDATION_MESSAGES.REQUEST_NUMBER_REQUIRED).max(MERCHANDISE_LIMITS.REQUEST_NUMBER_MAX_LENGTH),
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
    remittanceNumber: z.string().trim().min(1, MERCHANDISE_VALIDATION_MESSAGES.REMITTANCE_NUMBER_REQUIRED).max(MERCHANDISE_LIMITS.REMITTANCE_NUMBER_MAX_LENGTH),
    receivedAt: z.iso.date(),
    receivedQuantity: z.number().int().positive().max(100_000),
    responsibleName: z.string().trim().min(MERCHANDISE_LIMITS.RESPONSIBLE_NAME_MIN_LENGTH, MERCHANDISE_VALIDATION_MESSAGES.RESPONSIBLE_REQUIRED).max(MERCHANDISE_LIMITS.RESPONSIBLE_NAME_MAX_LENGTH),
    notes: z.string().trim().max(1000).optional(),
  }).strict(),
]);

export const merchandiseCancellationPayloadSchema = z.object({
  kind: z.enum(["period", "request", "remittance"]),
  action: z.literal("cancel"),
  ...merchandiseIdentitySchema.shape,
  reason: z.string().trim().min(MERCHANDISE_LIMITS.CANCELLATION_REASON_MIN_LENGTH, MERCHANDISE_VALIDATION_MESSAGES.CANCELLATION_REASON_REQUIRED).max(MERCHANDISE_LIMITS.CANCELLATION_REASON_MAX_LENGTH),
}).strict();

export const merchandiseOperationPayloadSchema = z.union([
  merchandisePayloadSchema,
  merchandiseUpdatePayloadSchema,
  merchandiseCancellationPayloadSchema,
]);

export type MerchandiseUpdatePayload = z.infer<typeof merchandiseUpdatePayloadSchema>;
export type MerchandiseCancellationPayload = z.infer<typeof merchandiseCancellationPayloadSchema>;
export type MerchandiseOperationPayload = z.infer<typeof merchandiseOperationPayloadSchema>;
