import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { z } from "zod";
import { RENDITION_LIMITS, RENDITION_DOCUMENT_TYPES, RENDITION_VALIDATION_MESSAGES } from "@/constants/rendition.constant";

export const renditionEmissionReportSourceSchema = z.object({
  deliveredModules: z.number().int().nonnegative(),
  registeredModuleQuantity: z.number().int().nonnegative(),
  familyCount: z.number().int().nonnegative(),
  participants: z.array(z.unknown()),
  event: z.object({ scheduledAt: z.string(), location: z.string() }).nullable(),
});

export const renditionDocumentTypeSchema = z.enum([
  RENDITION_DOCUMENT_TYPES.SIGNED_SHEET,
  RENDITION_DOCUMENT_TYPES.REMITTANCE,
  RENDITION_DOCUMENT_TYPES.SUPPORTING,
]);
export const renditionReviewStatusSchema = z.enum(["REVISADA", "OBSERVADA"]);

export const renditionEmissionTemplateSchema = z.object({
  issueDate: z.iso.date(),
  locality: z.string().trim().min(2).max(120),
  recipient: z.string().trim().min(2).max(160),
  recipientTitle: z.string().trim().max(160),
  associationName: z.string().trim().min(2).max(160),
  associationResolution: z.string().trim().max(120),
  associationAddress: z.string().trim().max(200),
  associationPhone: z.string().trim().max(40),
  associationEmail: z.union([z.email().max(160), z.literal("")]),
  observations: z.string().trim().max(1000),
  signatories: z.array(z.object({ name: z.string().trim().min(2).max(120), title: z.string().trim().min(2).max(120) }).strict()).min(1).max(4),
}).strict();

export const renditionEmissionPayloadSchema = z.object({
  renditionId: z.string().trim().min(1).max(80),
  template: renditionEmissionTemplateSchema,
}).strict();

export const renditionEmissionOperationPayloadSchema = z.object({
  kind: z.literal("rendition_emission"),
  id: z.uuid(),
  renditionId: z.string().trim().min(1).max(80),
  periodId: z.string().trim().min(1).max(80),
  beneficiarySheetId: z.string().trim().min(1).max(80),
  sourceDocumentIds: z.array(z.string().trim().min(1).max(80)).max(30),
  template: renditionEmissionTemplateSchema,
}).strict();

export const renditionSubmissionPayloadSchema = z.object({
  submittedAt: z.iso.date(),
  recipient: z.string().trim().min(2).max(160),
  externalReference: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
  evidenceDocument: z.object({
    id: z.uuid(),
    originalName: z.string().trim().min(1).max(RENDITION_LIMITS.MAX_FILENAME_LENGTH),
    contentBase64: z.string().max(1_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  }).optional(),
}).strict();

export const renditionSubmissionOperationPayloadSchema = z.object({
  kind: z.literal("rendition_submission"),
  id: z.string().trim().min(1).max(80),
  renditionId: z.string().trim().min(1).max(80),
  emissionId: z.string().trim().min(1).max(80),
  ...renditionSubmissionPayloadSchema.shape,
}).strict();

const documentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: renditionDocumentTypeSchema,
  supersedesId: z.string().trim().min(1).max(80).optional(),
  originalName: z.string().trim().min(1).max(RENDITION_LIMITS.MAX_FILENAME_LENGTH).refine((name) => name.toLowerCase().endsWith(".pdf"), RENDITION_VALIDATION_MESSAGES.PDF_EXTENSION_INVALID),
  contentType: z.literal(HTTP_CONTENT_TYPES.PDF),
  contentBase64: z.string().max(1_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});


export const renditionDocumentPayloadSchema = z.object({
  kind: z.literal("rendition_documents"),
  id: z.string().trim().min(1).max(80),
  periodId: z.string().trim().min(1).max(80),
  beneficiarySheetId: z.string().trim().min(1).max(80),
  documents: z.array(documentSchema).min(1).max(RENDITION_LIMITS.MAX_DOCUMENTS_PER_UPLOAD),
}).strict().superRefine((payload, context) => {
  const totalBytes = payload.documents.reduce((total, document) => total + Math.ceil(document.contentBase64.length * 3 / 4), 0);

  if (totalBytes > RENDITION_LIMITS.MAX_UPLOAD_BYTES) {
    context.addIssue({ code: "custom", message: RENDITION_VALIDATION_MESSAGES.UPLOAD_TOO_LARGE, path: ["documents"] });
  }

  const documentIds = new Set(payload.documents.map((document) => document.id));

  if (documentIds.size !== payload.documents.length) {
    context.addIssue({ code: "custom", message: RENDITION_VALIDATION_MESSAGES.DUPLICATE_DOCUMENT_ID, path: ["documents"] });
  }
});

const renditionReviewFieldsSchema = z.object({
  status: renditionReviewStatusSchema,
  notes: z.string().trim().max(1000).optional(),
}).strict();

function hasReviewNotes(review: { status: "REVISADA" | "OBSERVADA"; notes?: string }) {
  return review.status !== "OBSERVADA" || Boolean(review.notes);
}

export const renditionReviewPayloadSchema = renditionReviewFieldsSchema.refine(hasReviewNotes, {
  message: RENDITION_VALIDATION_MESSAGES.REVIEW_NOTES_REQUIRED,
  path: ["notes"],
});

export const renditionReviewOperationPayloadSchema = z.object({
  kind: z.literal("rendition_review"),
  id: z.string().trim().min(1).max(80),
  ...renditionReviewFieldsSchema.shape,
}).strict().refine(hasReviewNotes, {
  message: RENDITION_VALIDATION_MESSAGES.REVIEW_NOTES_REQUIRED,
  path: ["notes"],
});

export const renditionSynchronizationPayloadSchema = z.discriminatedUnion("kind", [
  renditionDocumentPayloadSchema,
  renditionEmissionOperationPayloadSchema,
  renditionReviewOperationPayloadSchema,
  renditionSubmissionOperationPayloadSchema,
]);

