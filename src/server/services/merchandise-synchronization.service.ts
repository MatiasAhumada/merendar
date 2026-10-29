
import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import type { PdfContentType } from "@/types/http";

import type { Prisma } from "@prisma/client";
import type { SynchronizationHandler, SubmittedSyncOperation, SyncHandlerResult } from "@/interfaces/synchronization.interface";
import type { JsonObject } from "@/types/json-value";

import {
  merchandiseOperationPayloadSchema,
  merchandisePayloadSchema,
  merchandiseUpdatePayloadSchema,
} from "@/schemas/merchandise.schema";
import type { MerchandiseOperationPayload, MerchandisePayload, MerchandiseUpdatePayload } from "@/types/schema-contracts";

interface DocumentInput {
  originalName: string;
  contentType: PdfContentType;
  contentBase64: string;
}

export class MerchandiseDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchandiseDocumentError";
  }
}

function decodeDocument(document: DocumentInput | undefined) {
  if (!document) {
    return null;
  }

  const content = Buffer.from(document.contentBase64, "base64");

  if (!content.length || content.length > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_COMPROBANTE_DEBE_PESAR_HASTA_512_KIB);
  }

  const header = content.subarray(0, 5).toString("ascii");
  const footer = content.subarray(Math.max(0, content.length - 1024)).toString("latin1");
  const isPdf = document.contentType === HTTP_CONTENT_TYPES.PDF && document.originalName.toLowerCase().endsWith(".pdf") && header === "%PDF-" && footer.includes("%%EOF");

  if (!isPdf) {
    throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_CONTENIDO_NO_ES_UN_PDF_VALIDO_REVISA_QUE_SEA_UN_ARCHIVO_PDF_EXPORTADO_C);
  }

  return { content, contentType: document.contentType, byteSize: content.length, originalName: document.originalName };
}

async function storeRequestDocument(
  transaction: Prisma.TransactionClient,
  payload: Extract<MerchandisePayload, { kind: "request" | "quota" }>,
  userId: string,
  requestId: string,
) {
  const document = decodeDocument(payload.document);

  if (!document) {
    return null;
  }

  return transaction.merchandiseDocument.create({
    data: { ...document, requestId, uploadedById: userId },
  });
}

async function storeRemittanceDocument(
  transaction: Prisma.TransactionClient,
  payload: Extract<MerchandisePayload, { kind: "remittance" }>,
  userId: string,
  remittanceId: string,
) {
  const document = decodeDocument(payload.document);

  if (!document) {
    return null;
  }

  return transaction.merchandiseDocument.create({
    data: { ...document, remittanceId, uploadedById: userId },
  });
}

function conflict(resourceVersion: number, current: JsonObject): SyncHandlerResult {
  return { type: "conflict", resourceVersion, current };
}

async function applyPeriod(transaction: Prisma.TransactionClient, payload: Extract<MerchandisePayload, { kind: "period" }>) {
  const duplicate = await transaction.merchandisePeriod.findFirst({ where: { label: payload.label, agency: payload.agency } });

  if (duplicate) {
    return conflict(1, { kind: "period_exists", id: duplicate.id, label: duplicate.label, agency: duplicate.agency });
  }

  const period = await transaction.merchandisePeriod.create({
    data: {
      id: payload.id,
      label: payload.label,
      agency: payload.agency,
      startsAt: new Date(payload.startsAt),
      endsAt: new Date(payload.endsAt),
    },
  });

  return { type: "synchronized", resourceVersion: 1, result: { resourceId: period.id, kind: "period" } } as const;
}

async function applyRequest(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation, payload: Extract<MerchandisePayload, { kind: "request" }>) {
  const duplicate = await transaction.merchandiseRequest.findUnique({ where: { requestNumber: payload.requestNumber } });

  if (duplicate) {
    return conflict(1, { kind: "request_number_exists", id: duplicate.id, requestNumber: duplicate.requestNumber });
  }

  const period = await transaction.merchandisePeriod.findUnique({ where: { id: payload.periodId } });

  if (!period || period.status !== "VIGENTE") {
    return conflict(period ? period.version : 0, { kind: "period_missing_or_cancelled", id: payload.periodId });
  }

  const request = await transaction.merchandiseRequest.create({
    data: {
      id: payload.id,
      periodId: period.id,
      requestNumber: payload.requestNumber,
      requestedAt: new Date(payload.requestedAt),
      requestedQuantity: payload.requestedQuantity,
      notes: payload.notes,
      createdById: operation.userId,
    },
  });
  await storeRequestDocument(transaction, payload, operation.userId, request.id);

  return { type: "synchronized", resourceVersion: 1, result: { resourceId: request.id, kind: "request" } } as const;
}

async function applyQuota(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation, payload: Extract<MerchandisePayload, { kind: "quota" }>) {
  const existingQuota = await transaction.merchandiseQuota.findUnique({ where: { requestId: payload.requestId } });

  if (existingQuota) {
    return conflict(1, { kind: "quota_exists", id: existingQuota.id, approvedQuantity: existingQuota.approvedQuantity });
  }

  const request = await transaction.merchandiseRequest.findUnique({ where: { id: payload.requestId } });

  if (!request || request.status === "CANCELADA" || request.status === "RECHAZADA") {
    return conflict(request ? request.version : 0, { kind: "request_missing_or_cancelled", id: payload.requestId });
  }

  if (payload.approvedQuantity > request.requestedQuantity) {
    return conflict(1, { kind: "quota_exceeds_request", requestedQuantity: request.requestedQuantity, approvedQuantity: payload.approvedQuantity });
  }

  const quota = await transaction.merchandiseQuota.create({
    data: {
      id: payload.id,
      requestId: request.id,
      approvedQuantity: payload.approvedQuantity,
      approvedAt: new Date(payload.approvedAt),
      notes: payload.notes,
      approvedById: operation.userId,
    },
  });
  await transaction.merchandiseRequest.update({ where: { id: request.id }, data: { status: "APROBADA" } });
  await storeRequestDocument(transaction, payload, operation.userId, request.id);

  return { type: "synchronized", resourceVersion: 1, result: { resourceId: quota.id, kind: "quota" } } as const;
}

async function applyRemittance(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation, payload: Extract<MerchandisePayload, { kind: "remittance" }>) {
  const duplicate = await transaction.merchandiseRemittance.findUnique({ where: { remittanceNumber: payload.remittanceNumber } });

  if (duplicate) {
    return conflict(1, { kind: "remittance_number_exists", id: duplicate.id, remittanceNumber: duplicate.remittanceNumber });
  }

  const quota = await transaction.merchandiseQuota.findUnique({ where: { id: payload.quotaId }, include: { request: { include: { period: true } } } });

  if (!quota || quota.requestId !== payload.requestId || quota.request.status === "CANCELADA" || quota.request.period.status !== "VIGENTE") {
    return conflict(0, { kind: "quota_missing_or_mismatched", requestId: payload.requestId, quotaId: payload.quotaId });
  }

  const previousReceipts = await transaction.merchandiseRemittance.aggregate({
    where: { quotaId: quota.id, status: "VIGENTE" },
    _sum: { receivedQuantity: true },
  });
  const receivedSoFar = previousReceipts._sum.receivedQuantity ?? 0;
  const totalAfterReceipt = receivedSoFar + payload.receivedQuantity;

  if (totalAfterReceipt > quota.approvedQuantity) {
    return conflict(1, {
      kind: "receipt_exceeds_quota",
      approvedQuantity: quota.approvedQuantity,
      receivedSoFar,
      attemptedQuantity: payload.receivedQuantity,
    });
  }

  const remittance = await transaction.merchandiseRemittance.create({
    data: {
      id: payload.id,
      requestId: payload.requestId,
      quotaId: quota.id,
      remittanceNumber: payload.remittanceNumber,
      receivedAt: new Date(payload.receivedAt),
      receivedQuantity: payload.receivedQuantity,
      responsibleName: payload.responsibleName,
      notes: payload.notes,
      createdById: operation.userId,
    },
  });
  await storeRemittanceDocument(transaction, payload, operation.userId, remittance.id);

  return { type: "synchronized", resourceVersion: 1, result: { resourceId: remittance.id, kind: "remittance" } } as const;
}

function resourceVersion(version: number) {
  return version;
}

function resourceConflict(version: number, current: Record<string, string | number | null>) {
  return conflict(resourceVersion(version), current);
}

async function applyUpdate(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation, payload: MerchandiseUpdatePayload) {
  const baseVersion = operation.baseVersion;

  if (!Number.isInteger(baseVersion)) {
    throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.LA_CORRECCION_NO_TIENE_UNA_VERSION_BASE_VALIDA);
  }

  if (payload.kind === "period") {
    const period = await transaction.merchandisePeriod.findUnique({ where: { id: payload.id } });

    if (!period) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_PERIODO_QUE_QUERES_CORREGIR);
    }

    if (period.version !== baseVersion) {
      return resourceConflict(period.version, { id: period.id, kind: "period", version: period.version, label: period.label, agency: period.agency, startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), status: period.status });
    }

    if (period.status !== "VIGENTE") {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_SE_PUEDE_CORREGIR_UN_PERIODO_ANULADO);
    }

    const duplicate = await transaction.merchandisePeriod.findFirst({ where: { id: { not: period.id }, label: payload.label, agency: payload.agency } });

    if (duplicate) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.YA_EXISTE_UN_PERIODO_CON_ESE_NOMBRE_Y_ORGANISMO);
    }

    const updated = await transaction.merchandisePeriod.update({ where: { id: period.id }, data: { label: payload.label, agency: payload.agency, startsAt: new Date(payload.startsAt), endsAt: new Date(payload.endsAt), version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "period" } } as const;
  }

  if (payload.kind === "request") {
    const request = await transaction.merchandiseRequest.findUnique({ where: { id: payload.id }, include: { quota: true } });

    if (!request) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_SOLICITUD_QUE_QUERES_CORREGIR);
    }

    if (request.version !== baseVersion) {
      return resourceConflict(request.version, { id: request.id, kind: "request", version: request.version, requestNumber: request.requestNumber, requestedAt: request.requestedAt.toISOString(), requestedQuantity: request.requestedQuantity, status: request.status });
    }

    if (request.status === "CANCELADA" || request.status === "RECHAZADA") {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_SE_PUEDE_CORREGIR_UNA_SOLICITUD_CANCELADA_O_RECHAZADA);
    }

    if (request.quota && payload.requestedQuantity < request.quota.approvedQuantity) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.LA_CANTIDAD_SOLICITADA_NO_PUEDE_SER_MENOR_AL_CUPO_APROBADO);
    }

    const duplicate = await transaction.merchandiseRequest.findFirst({ where: { id: { not: request.id }, requestNumber: payload.requestNumber } });

    if (duplicate) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.YA_EXISTE_UNA_SOLICITUD_CON_ESE_NUMERO);
    }

    const updated = await transaction.merchandiseRequest.update({ where: { id: request.id }, data: { requestNumber: payload.requestNumber, requestedAt: new Date(payload.requestedAt), requestedQuantity: payload.requestedQuantity, notes: payload.notes, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "request" } } as const;
  }

  if (payload.kind === "quota") {
    const quota = await transaction.merchandiseQuota.findUnique({ where: { id: payload.id }, include: { request: true } });

    if (!quota) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_CUPO_QUE_QUERES_CORREGIR);
    }

    if (quota.version !== baseVersion) {
      return resourceConflict(quota.version, { id: quota.id, kind: "quota", version: quota.version, approvedQuantity: quota.approvedQuantity, approvedAt: quota.approvedAt.toISOString() });
    }

    if (quota.request.status === "CANCELADA" || payload.approvedQuantity > quota.request.requestedQuantity) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_CUPO_DEBE_MANTENERSE_DENTRO_DE_LA_CANTIDAD_SOLICITADA_Y_DE_UNA_SOLICITU);
    }

    const receipts = await transaction.merchandiseRemittance.aggregate({ where: { quotaId: quota.id, status: "VIGENTE" }, _sum: { receivedQuantity: true } });

    if (payload.approvedQuantity < (receipts._sum.receivedQuantity ?? 0)) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_CUPO_CORREGIDO_NO_PUEDE_SER_MENOR_A_LAS_RECEPCIONES_YA_REGISTRADAS);
    }

    const updated = await transaction.merchandiseQuota.update({ where: { id: quota.id }, data: { approvedQuantity: payload.approvedQuantity, approvedAt: new Date(payload.approvedAt), notes: payload.notes, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "quota" } } as const;
  }

  if (payload.kind === "remittance") {
    const remittance = await transaction.merchandiseRemittance.findUnique({ where: { id: payload.id }, include: { quota: true } });

    if (!remittance) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_REMITO_QUE_QUERES_CORREGIR);
    }

    if (remittance.version !== baseVersion) {
      return resourceConflict(remittance.version, { id: remittance.id, kind: "remittance", version: remittance.version, remittanceNumber: remittance.remittanceNumber, receivedAt: remittance.receivedAt.toISOString(), receivedQuantity: remittance.receivedQuantity, responsibleName: remittance.responsibleName, status: remittance.status });
    }

    if (remittance.status !== "VIGENTE") {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_SE_PUEDE_CORREGIR_UN_REMITO_ANULADO);
    }

    const duplicate = await transaction.merchandiseRemittance.findFirst({ where: { id: { not: remittance.id }, remittanceNumber: payload.remittanceNumber } });

    if (duplicate) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.YA_EXISTE_UN_REMITO_CON_ESE_NUMERO);
    }

    const otherReceipts = await transaction.merchandiseRemittance.aggregate({ where: { quotaId: remittance.quotaId, id: { not: remittance.id }, status: "VIGENTE" }, _sum: { receivedQuantity: true } });

    if ((otherReceipts._sum.receivedQuantity ?? 0) + payload.receivedQuantity > remittance.quota.approvedQuantity) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.LA_CANTIDAD_CORREGIDA_SUPERA_EL_SALDO_DEL_CUPO_APROBADO);
    }

    const updated = await transaction.merchandiseRemittance.update({ where: { id: remittance.id }, data: { remittanceNumber: payload.remittanceNumber, receivedAt: new Date(payload.receivedAt), receivedQuantity: payload.receivedQuantity, responsibleName: payload.responsibleName, notes: payload.notes, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "remittance" } } as const;
  }

  throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.ESTE_TIPO_DE_REGISTRO_NO_ADMITE_CORRECCIONES);
}

async function applyCancellation(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation, payload: Extract<MerchandiseOperationPayload, { action: "cancel" }>) {
  if (!Number.isInteger(operation.baseVersion)) {
    throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.LA_ANULACION_NO_TIENE_UNA_VERSION_BASE_VALIDA);
  }

  if (payload.kind === "period") {
    const period = await transaction.merchandisePeriod.findUnique({ where: { id: payload.id }, include: { _count: { select: { requests: true, distributionRecords: true, beneficiarySheets: true, renditions: true } } } });

    if (!period) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_PERIODO_QUE_QUERES_ANULAR);
    }

    if (period.version !== operation.baseVersion) {
      return resourceConflict(period.version, { id: period.id, kind: "period", version: period.version, label: period.label, status: period.status });
    }

    if (period.status !== "VIGENTE" || Object.values(period._count).some((count) => count > 0)) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_PERIODO_TIENE_OPERACIONES_O_DOCUMENTACION_VINCULADA_Y_NO_SE_PUEDE_ANULA);
    }

    const updated = await transaction.merchandisePeriod.update({ where: { id: period.id }, data: { status: "ANULADO", cancelledAt: new Date(), cancelledById: operation.userId, cancellationReason: payload.reason, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "period", status: "ANULADO" } } as const;
  }

  if (payload.kind === "request") {
    const request = await transaction.merchandiseRequest.findUnique({ where: { id: payload.id }, include: { quota: true, _count: { select: { remittances: true } } } });

    if (!request) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_SOLICITUD_QUE_QUERES_ANULAR);
    }

    if (request.version !== operation.baseVersion) {
      return resourceConflict(request.version, { id: request.id, kind: "request", version: request.version, requestNumber: request.requestNumber, status: request.status });
    }

    if (request.status === "CANCELADA" || request.quota || request._count.remittances) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.LA_SOLICITUD_TIENE_CUPO_O_REMITOS_VINCULADOS_Y_NO_SE_PUEDE_ANULAR_LA_DOCUM);
    }

    const updated = await transaction.merchandiseRequest.update({ where: { id: request.id }, data: { status: "CANCELADA", notes: `${request.notes ? `${request.notes}\n` : ""}Anulada: ${payload.reason}`, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "request", status: "CANCELADA" } } as const;
  }

  if (payload.kind === "remittance") {
    const remittance = await transaction.merchandiseRemittance.findUnique({ where: { id: payload.id } });

    if (!remittance) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_REMITO_QUE_QUERES_ANULAR);
    }

    if (remittance.version !== operation.baseVersion) {
      return resourceConflict(remittance.version, { id: remittance.id, kind: "remittance", version: remittance.version, remittanceNumber: remittance.remittanceNumber, status: remittance.status });
    }

    if (remittance.status !== "VIGENTE") {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_REMITO_YA_ESTA_ANULADO);
    }

    const updated = await transaction.merchandiseRemittance.update({ where: { id: remittance.id }, data: { status: "ANULADO", cancelledAt: new Date(), cancelledById: operation.userId, cancellationReason: payload.reason, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "remittance", status: "ANULADO" } } as const;
  }

  throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.ESTE_TIPO_DE_REGISTRO_NO_ADMITE_ANULACIONES);
}

async function applyPayload(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation, payload: MerchandisePayload) {
  if (payload.kind === "period") {
    return applyPeriod(transaction, payload);
  }

  if (payload.kind === "request") {
    return applyRequest(transaction, operation, payload);
  }

  if (payload.kind === "quota") {
    return applyQuota(transaction, operation, payload);
  }

  return applyRemittance(transaction, operation, payload);
}

export const merchandiseSynchronizationHandler: SynchronizationHandler = {
  async apply(transaction, operation) {
    let rawPayload: unknown = operation.payload;

    // Older clients stored the serialized JSON as a string. Parse that legacy
    // representation so queued work can recover and synchronize normally.
    if (typeof rawPayload === "string") {
      try {
        rawPayload = JSON.parse(rawPayload);
      } catch {
        throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.REVISA_LOS_DATOS_DEL_CAMBIO_PENDIENTE_DE_MERCADERIA);
      }
    }

    const parsedPayload = merchandiseOperationPayloadSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.REVISA_LOS_DATOS_DEL_CAMBIO_PENDIENTE_DE_MERCADERIA);
    }

    const payload = parsedPayload.data;

    if (operation.resourceId !== payload.id) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_IDENTIFICADOR_DEL_BORRADOR_NO_COINCIDE_CON_SU_CONTENIDO);
    }

    if (operation.operation === "create") {
      if (!merchandisePayloadSchema.safeParse(payload).success || operation.baseVersion !== null) {
        throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.EL_ALTA_DE_MERCADERIA_NO_TIENE_UNA_VERSION_BASE_VALIDA);
      }

      const parsedCreatePayload = merchandisePayloadSchema.safeParse(payload);

      if (!parsedCreatePayload.success) {
        throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.REVISA_LOS_DATOS_DEL_ALTA_ANTES_DE_SINCRONIZAR);
      }

      return applyPayload(transaction, operation, parsedCreatePayload.data);
    }

    if (operation.operation === "update") {
      const parsedUpdate = merchandiseUpdatePayloadSchema.safeParse(payload);

      if (!parsedUpdate.success) {
        throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.REVISA_LOS_DATOS_DE_LA_CORRECCION_ANTES_DE_SINCRONIZAR);
      }

      return applyUpdate(transaction, operation, parsedUpdate.data);
    }

    const cancellation = merchandiseOperationPayloadSchema.safeParse(payload);

    if (!cancellation.success || !("action" in cancellation.data)) {
      throw new MerchandiseDocumentError(MERCHANDISE_ERROR_MESSAGES.REVISA_LOS_DATOS_DE_LA_ANULACION_ANTES_DE_SINCRONIZAR);
    }

    return applyCancellation(transaction, operation, cancellation.data);
  },
};
