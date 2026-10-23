import type { Prisma } from "@prisma/client";
import type { SynchronizationHandler, SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import type { JsonObject } from "@/types/json-value";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import {
  renditionDocumentPayloadSchema,
  renditionReviewOperationPayloadSchema,
  type RenditionDocumentPayload,
} from "@/validations/rendition.validation";

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
    throw new RenditionDocumentError("No encontramos la rendición seleccionada.", 404);
  }

  const signedSheetCount = await transaction.renditionDocument.count({
    where: {
      renditionId: rendition.id,
      documentType: "PLANILLA_FIRMADA",
      supersededBy: { none: {} },
    },
  });

  if (!signedSheetCount) {
    throw new RenditionDocumentError("Adjuntá una planilla firmada vigente antes de revisar la rendición.", 409);
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
    throw new RenditionDocumentError("Cada PDF debe pesar hasta 512 KiB y no puede estar vacío.");
  }

  const header = content.subarray(0, 5).toString("ascii");
  const footer = content.subarray(Math.max(0, content.length - 1024)).toString("latin1");

  if (header !== "%PDF-" || !footer.includes("%%EOF")) {
    throw new RenditionDocumentError("El contenido no es un PDF válido. Revisá que el archivo se haya exportado correctamente.");
  }

  if (!originalName.toLowerCase().endsWith(".pdf")) {
    throw new RenditionDocumentError("La planilla y sus respaldos deben ser archivos PDF.");
  }

  return { content, byteSize: content.length, contentType: "application/pdf" };
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
    throw new RenditionDocumentError("La planilla emitida no pertenece al período seleccionado o ya no está disponible.");
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
    throw new RenditionDocumentError("La rendición alcanzó el máximo de 20 documentos.");
  }

  const createdDocumentIds: string[] = [];

  for (const document of payload.documents) {
    if (document.supersedesId) {
      const supersededDocument = storedDocuments.find((candidate) => candidate.id === document.supersedesId);
      const hasExistingReplacement = storedDocuments.some((candidate) => candidate.supersedesId === document.supersedesId);

      if (!supersededDocument || supersededDocument.documentType !== document.type || hasExistingReplacement) {
        throw new RenditionDocumentError("Elegí un documento vigente de esta rendición para corregirlo.");
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
        throw new RenditionDocumentError("La revisión no coincide con la rendición seleccionada.");
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
      throw new RenditionDocumentError("La carga no coincide con la operación pendiente.");
    }

    const result = await applyDocuments(transaction, operation, parsedPayload.data);
    return { type: "synchronized", resourceVersion: 1, result: resultPayload(result) };
  },
};
