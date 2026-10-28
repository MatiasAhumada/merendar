import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { z } from "zod";
import { RENDITION_LIMITS, RENDITION_DOCUMENT_TYPES, RENDITION_VALIDATION_MESSAGES } from "@/constants/rendition.constant";

const documentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum([
    RENDITION_DOCUMENT_TYPES.SIGNED_SHEET,
    RENDITION_DOCUMENT_TYPES.REMITTANCE,
    RENDITION_DOCUMENT_TYPES.SUPPORTING,
  ]),
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
  status: z.enum(["REVISADA", "OBSERVADA"]),
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
  renditionReviewOperationPayloadSchema,
]);

export type RenditionDocumentPayload = z.infer<typeof renditionDocumentPayloadSchema>;
export type RenditionReviewPayload = z.infer<typeof renditionReviewPayloadSchema>;
export type RenditionReviewOperationPayload = z.infer<typeof renditionReviewOperationPayloadSchema>;
