import { z } from "zod";
import { RENDITION_LIMITS, RENDITION_DOCUMENT_TYPES } from "@/constants/rendition.constant";

const documentSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum([
    RENDITION_DOCUMENT_TYPES.SIGNED_SHEET,
    RENDITION_DOCUMENT_TYPES.REMITTANCE,
    RENDITION_DOCUMENT_TYPES.SUPPORTING,
  ]),
  supersedesId: z.string().trim().min(1).max(80).optional(),
  originalName: z.string().trim().min(1).max(180).refine((name) => name.toLowerCase().endsWith(".pdf"), "El archivo debe tener extensión PDF."),
  contentType: z.literal("application/pdf"),
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
    context.addIssue({ code: "custom", message: "La selección supera el máximo de carga de 700 KiB.", path: ["documents"] });
  }

  const documentIds = new Set(payload.documents.map((document) => document.id));

  if (documentIds.size !== payload.documents.length) {
    context.addIssue({ code: "custom", message: "Cada archivo debe tener un identificador único.", path: ["documents"] });
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
  message: "Indicá qué documentación debe corregirse.",
  path: ["notes"],
});

export const renditionReviewOperationPayloadSchema = z.object({
  kind: z.literal("rendition_review"),
  id: z.string().trim().min(1).max(80),
  ...renditionReviewFieldsSchema.shape,
}).strict().refine(hasReviewNotes, {
  message: "Indicá qué documentación debe corregirse.",
  path: ["notes"],
});

export const renditionSynchronizationPayloadSchema = z.discriminatedUnion("kind", [
  renditionDocumentPayloadSchema,
  renditionReviewOperationPayloadSchema,
]);

export type RenditionDocumentPayload = z.infer<typeof renditionDocumentPayloadSchema>;
export type RenditionReviewPayload = z.infer<typeof renditionReviewPayloadSchema>;
export type RenditionReviewOperationPayload = z.infer<typeof renditionReviewOperationPayloadSchema>;
