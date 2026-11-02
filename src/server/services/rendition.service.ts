import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import { findRenditionDocument, reviewRendition, type RenditionReviewStatus } from "@/server/repository/rendition.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import { findLatestRenditionEmissionId, findRenditionEmissionFile, findRenditionEmissionSource, recordRenditionSubmission, RenditionSubmissionDocumentLimitError, saveRenditionEmission } from "@/server/repository/rendition-emission.repository";
import { createRenditionEmissionPdfs } from "@/server/services/rendition-emission-pdf.service";
import type { z } from "zod";
import type { renditionEmissionTemplateSchema, renditionSubmissionPayloadSchema } from "@/schemas/rendition.schema";

export async function getRenditionDocument(id: string) {
  return findRenditionDocument(id);
}

export async function reviewRenditionDocument(input: {
  id: string;
  userId: string;
  status: RenditionReviewStatus;
  notes?: string;
}) {
  const result = await reviewRendition(input);

  if (result.type === "missing") {
    throw new ApiError({ status: 404, message: RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA });
  }

  if (result.type === "signed-sheet-required") {
    throw new ApiError({ status: 409, message: RENDITION_ERROR_MESSAGES.ADJUNTA_UNA_PLANILLA_FIRMADA_VIGENTE_ANTES_DE_REVISAR_LA_RENDICION });
  }

  return result.rendition;
}

export async function createRenditionEmission(input: {
  renditionId: string;
  userId: string;
  template: z.infer<typeof renditionEmissionTemplateSchema>;
}) {
  const source = await findRenditionEmissionSource(input.renditionId);

  if (!source) {
    throw new ApiError({ status: 404, message: RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA });
  }

  const documents = await createRenditionEmissionPdfs(source, input.template);
  return saveRenditionEmission({ ...documents, renditionId: input.renditionId, userId: input.userId });
}

export async function getRenditionEmissionFile(id: string, kind: "note" | "summary" | "package") {
  return findRenditionEmissionFile(id, kind);
}

export async function createRenditionSubmission(input: {
  renditionId: string;
  userId: string;
  payload: z.infer<typeof renditionSubmissionPayloadSchema>;
}) {
  const rendition = await findRenditionEmissionSource(input.renditionId);

  if (!rendition) {
    throw new ApiError({ status: 404, message: RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA });
  }

  const emissionId = await findLatestRenditionEmissionId(input.renditionId);
  if (!emissionId) {
    throw new ApiError({ status: 409, message: RENDITION_ERROR_MESSAGES.EMITE_UN_BORRADOR_ANTES_DE_REGISTRAR_LA_PRESENTACION });
  }

  let evidenceDocument: { id: string; originalName: string; content: Uint8Array } | undefined;
  if (input.payload.evidenceDocument) {
    const evidenceBytes = Buffer.from(input.payload.evidenceDocument.contentBase64, "base64");
    const hasPdfHeader = evidenceBytes.subarray(0, 5).toString("ascii") === "%PDF-";
    const hasPdfFooter = evidenceBytes.subarray(Math.max(0, evidenceBytes.length - 1024)).toString("latin1").includes("%%EOF");
    const validPdfName = input.payload.evidenceDocument.originalName.toLowerCase().endsWith(".pdf");
    if (!evidenceBytes.length || evidenceBytes.length > RENDITION_LIMITS.MAX_DOCUMENT_BYTES || !hasPdfHeader || !hasPdfFooter || !validPdfName) {
      throw new ApiError({ status: 400, message: RENDITION_ERROR_MESSAGES.EL_CONTENIDO_NO_ES_UN_PDF_VALIDO_REVISA_QUE_EL_ARCHIVO_SE_HAYA_EXPORTADO_C });
    }
    evidenceDocument = { id: input.payload.evidenceDocument.id, originalName: input.payload.evidenceDocument.originalName, content: evidenceBytes };
  }

  try {
    return await recordRenditionSubmission({ ...input.payload, renditionId: input.renditionId, userId: input.userId, emissionId, evidenceDocument });
  } catch (error) {
    if (error instanceof RenditionSubmissionDocumentLimitError) {
      throw new ApiError({ status: 409, message: RENDITION_ERROR_MESSAGES.LA_RENDICION_ALCANZO_EL_MAXIMO_DE_20_DOCUMENTOS });
    }
    throw error;
  }
}
