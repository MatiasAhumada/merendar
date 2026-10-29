import { z } from "zod";
import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
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

export const receiptLimitConflictSchema = z.object({
  kind: z.literal("receipt_exceeds_quota"),
  approvedQuantity: z.number().int(),
  receivedSoFar: z.number().int(),
  attemptedQuantity: z.number().int(),
});
export const duplicateRemittanceConflictSchema = z.object({
  kind: z.literal("remittance_number_exists"),
  remittanceNumber: z.string(),
});


export const merchandiseResponseSchema = z.object({
  periods: z.array(z.object({
    id: z.string(),
    version: z.number().int().positive(),
    label: z.string(),
    agency: z.string(),
    status: z.enum(["VIGENTE", "ANULADO"]),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    beneficiarySheets: z.array(z.object({
      id: z.string(),
      version: z.number().int(),
      createdAt: z.iso.datetime(),
      beneficiaryCount: z.number().int().nonnegative(),
    })),
    renditions: z.array(z.object({
      id: z.string(),
      periodId: z.string(),
      beneficiarySheetId: z.string(),
      reviewStatus: z.enum(["PENDIENTE", "REVISADA", "OBSERVADA"]),
      reviewNotes: z.string().nullable(),
      reviewedAt: z.iso.datetime().nullable(),
      beneficiarySheet: z.object({ id: z.string(), version: z.number().int(), createdAt: z.iso.datetime(), beneficiaryCount: z.number().int().nonnegative() }),
      documents: z.array(z.object({
        id: z.string(),
        documentType: z.enum(["PLANILLA_FIRMADA", "REMITO", "RESPALDO"]),
        version: z.number().int(),
        supersedesId: z.string().nullable(),
        originalName: z.string(),
        byteSize: z.number().int(),
        createdAt: z.iso.datetime(),
      })),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    })),
    requests: z.array(z.object({
      id: z.string(),
      version: z.number().int().positive(),
      periodId: z.string(),
      requestNumber: z.string(),
      requestedAt: z.iso.datetime(),
      requestedQuantity: z.number(),
      status: z.enum(["PENDIENTE", "APROBADA", "RECHAZADA", "CANCELADA"]),
      notes: z.string().nullable(),
      createdBy: z.object({ id: z.string(), name: z.string() }),
      quota: z.object({
        id: z.string(),
        version: z.number().int().positive(),
        requestId: z.string(),
        approvedQuantity: z.number(),
        approvedAt: z.iso.datetime(),
        notes: z.string().nullable(),
        approvedBy: z.object({ id: z.string(), name: z.string() }),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      }).nullable(),
      remittances: z.array(z.object({
        id: z.string(),
        version: z.number().int().positive(),
        requestId: z.string(),
        quotaId: z.string(),
        remittanceNumber: z.string(),
        receivedAt: z.iso.datetime(),
        receivedQuantity: z.number(),
        responsibleName: z.string(),
        status: z.enum(["VIGENTE", "ANULADO"]),
        notes: z.string().nullable(),
        createdBy: z.object({ id: z.string(), name: z.string() }),
        documents: z.array(z.object({
          id: z.string(),
          originalName: z.string(),
          contentType: z.string(),
          byteSize: z.number(),
          createdAt: z.iso.datetime(),
        })),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      })),
      documents: z.array(z.object({
        id: z.string(),
        originalName: z.string(),
        contentType: z.string(),
        byteSize: z.number(),
        createdAt: z.iso.datetime(),
      })),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    })),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })),
});
