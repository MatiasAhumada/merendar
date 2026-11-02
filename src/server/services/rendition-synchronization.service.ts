
import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { RENDITION_LIMITS, RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import type { Prisma } from "@prisma/client";
import type { SynchronizationHandler, SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import type { JsonObject } from "@/types/json-value";
import type { RenditionEmissionOperationPayload, RenditionSubmissionOperationPayload } from "@/interfaces/rendition.interface";
import { createRenditionEmissionPdfs } from "@/server/services/rendition-emission-pdf.service";
import { findRenditionEmissionSource, saveRenditionEmissionInTransaction } from "@/server/repository/rendition-emission.repository";

import {
  renditionDocumentPayloadSchema,
  renditionEmissionOperationPayloadSchema,
  renditionReviewOperationPayloadSchema,
  renditionSubmissionOperationPayloadSchema,
} from "@/schemas/rendition.schema";
import type { RenditionDocumentPayload } from "@/types/schema-contracts";

export class RenditionDocumentError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "RenditionDocumentError";
  }
}

function copyPdfBytes(content: Uint8Array): Uint8Array<ArrayBuffer> {
  const copiedContent = new Uint8Array(new ArrayBuffer(content.byteLength));
  copiedContent.set(content);
  return copiedContent;
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

function decodePdfDocument(document: RenditionDocumentPayload["documents"][number], attachments: ReadonlyMap<string, Uint8Array>) {
  let attachedContent: Uint8Array | undefined;
  if (document.attachmentId) {
    attachedContent = attachments.get(document.attachmentId);
  }
  if (document.attachmentId && !attachedContent) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.EL_CONTENIDO_NO_ES_UN_PDF_VALIDO_REVISA_QUE_EL_ARCHIVO_SE_HAYA_EXPORTADO_C);
  }
  let content: Buffer;
  if (attachedContent) {
    content = Buffer.from(attachedContent);
  } else {
    content = Buffer.from(document.contentBase64, "base64");
  }

  if (!content.length || content.length > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.CADA_PDF_DEBE_PESAR_HASTA_512_KIB_Y_NO_PUEDE_ESTAR_VACIO);
  }

  const header = content.subarray(0, 5).toString("ascii");
  const footer = content.subarray(Math.max(0, content.length - 1024)).toString("latin1");

  if (header !== "%PDF-" || !footer.includes("%%EOF")) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.EL_CONTENIDO_NO_ES_UN_PDF_VALIDO_REVISA_QUE_EL_ARCHIVO_SE_HAYA_EXPORTADO_C);
  }

  if (!document.originalName.toLowerCase().endsWith(".pdf")) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_PLANILLA_Y_SUS_RESPALDOS_DEBEN_SER_ARCHIVOS_PDF);
  }

  return { content: copyPdfBytes(content), byteSize: content.length, contentType: HTTP_CONTENT_TYPES.PDF };
}

async function applyDocuments(
  transaction: Prisma.TransactionClient,
  operation: SubmittedSyncOperation,
  payload: RenditionDocumentPayload,
) {
  const sheet = await transaction.beneficiarySheet.findUnique({
    where: { id: payload.beneficiarySheetId },
    select: { id: true, periodId: true, distributionEventId: true },
  });

  if (!sheet || sheet.periodId !== payload.periodId) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_PLANILLA_EMITIDA_NO_PERTENECE_AL_PERIODO_SELECCIONADO_O_YA_NO_ESTA_DISP);
  }

  const rendition = await transaction.rendition.upsert({
    where: { beneficiarySheetId: sheet.id },
    create: {
      id: payload.id,
      periodId: sheet.periodId,
      distributionEventId: sheet.distributionEventId,
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
    const decoded = decodePdfDocument(document, operation.attachments ?? new Map());
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

async function applySubmission(
  transaction: Prisma.TransactionClient,
  operation: SubmittedSyncOperation,
  payload: RenditionSubmissionOperationPayload,
) {
  if (payload.id !== operation.resourceId || payload.renditionId !== operation.resourceId) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_PRESENTACION_NO_COINCIDE_CON_LA_RENDICION_SELECCIONADA);
  }

  const rendition = await transaction.rendition.findUnique({ where: { id: payload.renditionId }, select: { id: true } });
  if (!rendition) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA, 404);
  }

  const emission = await transaction.renditionEmission.findFirst({
    where: { id: payload.emissionId, renditionId: rendition.id },
    select: { id: true },
  });
  if (!emission) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.EMITE_UN_BORRADOR_ANTES_DE_REGISTRAR_LA_PRESENTACION, 409);
  }

  let evidenceDocumentId: string | null = null;
  if (payload.evidenceDocument) {
    let attachedContent: Uint8Array | undefined;
    if (payload.evidenceDocument.attachmentId) {
      attachedContent = operation.attachments?.get(payload.evidenceDocument.attachmentId);
    }
    if (payload.evidenceDocument.attachmentId && !attachedContent) {
      throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.EL_CONTENIDO_NO_ES_UN_PDF_VALIDO_REVISA_QUE_EL_ARCHIVO_SE_HAYA_EXPORTADO_C);
    }
    let content: Buffer;
    if (attachedContent) {
      content = Buffer.from(attachedContent);
    } else {
      content = Buffer.from(payload.evidenceDocument.contentBase64, "base64");
    }
    const footer = content.subarray(Math.max(0, content.length - 1024)).toString("latin1");
    const validPdf = content.subarray(0, 5).toString("ascii") === "%PDF-" && footer.includes("%%EOF");
    const validSize = content.length > 0 && content.length <= RENDITION_LIMITS.MAX_DOCUMENT_BYTES;
    const validName = payload.evidenceDocument.originalName.toLowerCase().endsWith(".pdf");
    if (!validPdf || !validSize || !validName) {
      throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.EL_CONTENIDO_NO_ES_UN_PDF_VALIDO_REVISA_QUE_EL_ARCHIVO_SE_HAYA_EXPORTADO_C);
    }

    const documents = await transaction.renditionDocument.findMany({ where: { renditionId: rendition.id }, select: { documentType: true, version: true } });
    if (documents.length >= RENDITION_LIMITS.MAX_DOCUMENTS_PER_RENDITION) {
      throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_RENDICION_ALCANZO_EL_MAXIMO_DE_20_DOCUMENTOS, 409);
    }
    const documentVersion = documents.filter((document) => document.documentType === "RESPALDO").reduce((latestVersion, document) => Math.max(latestVersion, document.version), 0) + 1;
    const savedEvidence = await transaction.renditionDocument.create({
      data: {
        id: payload.evidenceDocument.id,
        operationId: operation.operationId,
        renditionId: rendition.id,
        documentType: "RESPALDO",
        version: documentVersion,
        originalName: payload.evidenceDocument.originalName,
        contentType: HTTP_CONTENT_TYPES.PDF,
        byteSize: content.byteLength,
        content: copyPdfBytes(content),
        uploadedById: operation.userId,
      },
      select: { id: true },
    });
    evidenceDocumentId = savedEvidence.id;
    await transaction.rendition.update({ where: { id: rendition.id }, data: { reviewStatus: "PENDIENTE", reviewNotes: null, reviewedAt: null, reviewedById: null } });
  }

  const submission = await transaction.renditionSubmission.create({
    data: {
      renditionId: rendition.id,
      emissionId: emission.id,
      submittedAt: new Date(`${payload.submittedAt}T00:00:00.000Z`),
      recipient: payload.recipient,
      externalReference: payload.externalReference,
      notes: payload.notes,
      evidenceDocumentId,
      recordedById: operation.userId,
    },
    select: { id: true },
  });

  return { submissionId: submission.id, renditionId: rendition.id, evidenceDocumentId };
}

async function applyEmission(
  transaction: Prisma.TransactionClient,
  operation: SubmittedSyncOperation,
  payload: RenditionEmissionOperationPayload,
) {
  if (payload.id !== operation.resourceId) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_EMISION_NO_COINCIDE_CON_LA_OPERACION_PENDIENTE);
  }

  const sheet = await transaction.beneficiarySheet.findUnique({
    where: { id: payload.beneficiarySheetId },
    select: { id: true, periodId: true, distributionEventId: true },
  });
  if (!sheet || sheet.periodId !== payload.periodId) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_PLANILLA_EMITIDA_NO_PERTENECE_AL_PERIODO_SELECCIONADO_O_YA_NO_ESTA_DISP, 409);
  }

  const rendition = await transaction.rendition.upsert({
    where: { beneficiarySheetId: sheet.id },
    create: {
      id: payload.renditionId,
      periodId: sheet.periodId,
      distributionEventId: sheet.distributionEventId,
      beneficiarySheetId: sheet.id,
      createdById: operation.userId,
    },
    update: {},
    select: { id: true },
  });
  if (rendition.id !== payload.renditionId) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_EMISION_NO_COINCIDE_CON_LA_OPERACION_PENDIENTE, 409);
  }

  const source = await findRenditionEmissionSource(payload.renditionId, transaction);
  if (!source) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA, 404);
  }
  if (source.periodId !== payload.periodId || source.beneficiarySheetId !== payload.beneficiarySheetId) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LA_PLANILLA_EMITIDA_NO_PERTENECE_AL_PERIODO_SELECCIONADO_O_YA_NO_ESTA_DISP, 409);
  }

  const availableSourceIds = new Set([
    ...source.documents.map((document) => document.id),
    ...source.period.requests.flatMap((request) => [
      ...request.documents.map((document) => document.id),
      ...request.issuedDocuments.map((document) => document.id),
      ...request.remittances.flatMap((remittance) => remittance.documents.map((document) => document.id)),
    ]),
  ]);
  if (payload.sourceDocumentIds.some((documentId) => !availableSourceIds.has(documentId))) {
    throw new RenditionDocumentError(RENDITION_ERROR_MESSAGES.LOS_DOCUMENTOS_ORIGINALES_CAMBIARON_DESDE_LA_PREPARACION_OFFLINE, 409);
  }

  const pdfs = await createRenditionEmissionPdfs(source, payload.template);
  const emission = await saveRenditionEmissionInTransaction(transaction, {
    id: payload.id,
    renditionId: payload.renditionId,
    userId: operation.userId,
    ...pdfs,
  });

  return { emissionId: emission.id, renditionId: payload.renditionId, version: emission.version };
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
    const parsedEmission = renditionEmissionOperationPayloadSchema.safeParse(operation.payload);
    if (parsedEmission.success) {
      const result = await applyEmission(transaction, operation, parsedEmission.data);
      return {
        type: "synchronized",
        resourceVersion: result.version,
        result: { emissionId: result.emissionId, renditionId: result.renditionId, version: result.version },
      };
    }

    const parsedSubmission = renditionSubmissionOperationPayloadSchema.safeParse(operation.payload);
    if (parsedSubmission.success) {
      const result = await applySubmission(transaction, operation, parsedSubmission.data);
      return {
        type: "synchronized",
        resourceVersion: 1,
        result: {
          renditionId: result.renditionId,
          submissionId: result.submissionId,
          evidenceDocumentId: result.evidenceDocumentId,
        },
      };
    }

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
