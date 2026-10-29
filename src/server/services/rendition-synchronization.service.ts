
import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { RENDITION_LIMITS, RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import type { Prisma } from "@prisma/client";
import type { SynchronizationHandler, SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import type { JsonObject } from "@/types/json-value";

import {
  renditionDocumentPayloadSchema,
  renditionReviewOperationPayloadSchema,
} from "@/schemas/rendition.schema";
import type { RenditionDocumentPayload } from "@/types/schema-contracts";

export class RenditionDocumentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "RenditionDocumentError";
  }
}

async function applyReview(
  transaction: Prisma.TransactionClient,
  operation: SubmittedSyncOperation,
  status: "REVISADA" | "OBSERVADA",
  notes?: string,
) {
  const rendition = await transaction.rendition.findUnique({
    where: { id: operation.resourceId },
    select: { id: true },
  });

  if (!rendition) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA, 404);
  }

  const signedSheetCount = await transaction.renditionDocument.count({
    where: {
      renditionId: rendition.id,
      documentType: "PLANILLA_FIRMADA",
      supersededBy: { none: {} },
    },
  });

  if (!signedSheetCount) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.ADJUNTA_UNA_PLANILLA_FIRMADA_VIGENTE_ANTES_DE_REVISAR_LA_RENDICION, 409);
  }

  const updatedRendition = await transaction.rendition.update({
    where: { id: rendition.id },
    data: {
      reviewStatus: status,
      reviewNotes: notes ?? null,
      reviewedAt: new Date(),
      reviewedById: operation.userId,
    },
    select: { id: true, reviewStatus: true, reviewNotes: true, reviewedAt: true },
  });

  return {
    id: updatedRendition.id,
    reviewStatus: updatedRendition.reviewStatus,
    reviewNotes: updatedRendition.reviewNotes,
    reviewedAt: updatedRendition.reviewedAt?.toISOString() ?? null,
  };
}

function decodePdfDocument(originalName: string, contentBase64: string) {
  const content = Buffer.from(contentBase64, "base64");

  if (!content.length || content.length > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.CADA_PDF_DEBE_PESAR_HASTA_512_KIB_Y_NO_PUEDE_ESTAR_VACIO);
  }

  const header = content.subarray(0, 5).toString("ascii");
  const footer = content.subarray(Math.max(0, content.length - 1024)).toString("latin1");

  if (header !== "%PDF-" || !footer.includes("%%EOF")) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.EL_CONTENIDO_NO_ES_UN_PDF_VALIDO_REVISA_QUE_EL_ARCHIVO_SE_HAYA_EXPORTADO_C);
  }

  if (!originalName.toLowerCase().endsWith(".pdf")) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_PLANILLA_Y_SUS_RESPALDOS_DEBEN_SER_ARCHIVOS_PDF);
  }

  return { content, byteSize: content.length, contentType: HTTP_CONTENT_TYPES.PDF };
}

async function applyDocuments(
  transaction: Prisma.TransactionClient,
  operation: SubmittedSyncOperation,
  payload: RenditionDocumentPayload,
) {
  const sheet = await transaction.beneficiarySheet.findUnique({
    where: { id: payload.beneficiarySheetId },
    select: { id: true, periodId: true },
  });

  if (!sheet || sheet.periodId !== payload.periodId) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_PLANILLA_EMITIDA_NO_PERTENECE_AL_PERIODO_SELECCIONADO_O_YA_NO_ESTA_DISP);
  }

  const rendition = await transaction.rendition.upsert({
    where: { beneficiarySheetId: sheet.id },
    create: {
      id: payload.id,
      periodId: sheet.periodId,
      beneficiarySheetId: sheet.id,
      createdById: operation.userId,
    },
    update: {},
    select: { id: true, reviewStatus: true },
  });
  const storedDocuments = await transaction.renditionDocument.findMany({
    where: { renditionId: rendition.id },
    select: { id: true, documentType: true, supersedesId: true },
  });

  if (storedDocuments.length + payload.documents.length > RENDITION_LIMITS.MAX_DOCUMENTS_PER_RENDITION) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_RENDICION_ALCANZO_EL_MAXIMO_DE_20_DOCUMENTOS);
  }

  const createdDocumentIds: string[] = [];

  for (const document of payload.documents) {
    if (document.supersedesId) {
      const supersededDocument = storedDocuments.find((candidate) => candidate.id === document.supersedesId);
      const hasExistingReplacement = storedDocuments.some((candidate) => candidate.supersedesId === document.supersedesId);

      if (!supersededDocument || supersededDocument.documentType !== document.type || hasExistingReplacement) {
        throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.ELEGI_UN_DOCUMENTO_VIGENTE_DE_ESTA_RENDICION_PARA_CORREGIRLO);
      }
    }

    const nextVersion = storedDocuments.filter((candidate) => candidate.documentType === document.type).length + 1;
    const decoded = decodePdfDocument(document.originalName, document.contentBase64);
    const createdDocument = await transaction.renditionDocument.create({
      data: {
        id: document.id,
        operationId: operation.operationId,
        renditionId: rendition.id,
        documentType: document.type,
        version: nextVersion,
        supersedesId: document.supersedesId,
        originalName: document.originalName,
        contentType: decoded.contentType,
        byteSize: decoded.byteSize,
        content: decoded.content,
        uploadedById: operation.userId,
      },
      select: { id: true },
    });
    createdDocumentIds.push(createdDocument.id);
    storedDocuments.push({ id: createdDocument.id, documentType: document.type, supersedesId: document.supersedesId ?? null });
  }

  if (rendition.reviewStatus !== "PENDIENTE") {
    await transaction.rendition.update({
      where: { id: rendition.id },
      data: { reviewStatus: "PENDIENTE", reviewNotes: null, reviewedAt: null, reviewedById: null },
    });
  }

  return { renditionId: rendition.id, documentCount: createdDocumentIds.length, documentIds: createdDocumentIds };
}

function resultPayload(result: Awaited<ReturnType<typeof applyDocuments>>): JsonObject {
  return {
    renditionId: result.renditionId,
    documentCount: result.documentCount,
    documentIds: result.documentIds,
  };
}

export const renditionSynchronizationHandler: SynchronizationHandler = {
  async apply(transaction, operation) {
    const parsedReview = renditionReviewOperationPayloadSchema.safeParse(operation.payload);

    if (parsedReview.success) {
      if (parsedReview.data.id !== operation.resourceId) {
        throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_REVISION_NO_COINCIDE_CON_LA_RENDICION_SELECCIONADA);
      }

      const result = await applyReview(transaction, operation, parsedReview.data.status, parsedReview.data.notes);
      return {
        type: "synchronized",
        resourceVersion: 1,
        result: {
          renditionId: result.id,
          reviewStatus: result.reviewStatus,
          reviewNotes: result.reviewNotes,
          reviewedAt: result.reviewedAt,
        },
      };
    }

    const parsedPayload = renditionDocumentPayloadSchema.safeParse(operation.payload);

    if (!parsedPayload.success || parsedPayload.data.id !== operation.resourceId) {
      throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_CARGA_NO_COINCIDE_CON_LA_OPERACION_PENDIENTE);
    }

    const result = await applyDocuments(transaction, operation, parsedPayload.data);
    return { type: "synchronized", resourceVersion: 1, result: resultPayload(result) };
  },
};
