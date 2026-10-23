import type { Prisma } from "@prisma/client";
import type { SynchronizationHandler, SubmittedSyncOperation, SyncHandlerResult } from "@/interfaces/synchronization.interface";
import type { JsonObject } from "@/types/json-value";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import {
  merchandiseOperationPayloadSchema,
  merchandisePayloadSchema,
  merchandiseUpdatePayloadSchema,
  type MerchandiseOperationPayload,
  type MerchandisePayload,
  type MerchandiseUpdatePayload,
} from "@/validations/merchandise.validation";

interface DocumentInput {
  originalName: string;
  contentType: "application/pdf";
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
    throw new MerchandiseDocumentError("El comprobante debe pesar hasta 512 KiB.");
  }

  const header = content.subarray(0, 5).toString("ascii");
  const footer = content.subarray(Math.max(0, content.length - 1024)).toString("latin1");
  const isPdf = document.contentType === "application/pdf" && document.originalName.toLowerCase().endsWith(".pdf") && header === "%PDF-" && footer.includes("%%EOF");

  if (!isPdf) {
    throw new MerchandiseDocumentError("El contenido no es un PDF válido. Revisá que sea un archivo PDF exportado correctamente.");
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
    throw new MerchandiseDocumentError("La corrección no tiene una versión base válida.");
  }

  if (payload.kind === "period") {
    const period = await transaction.merchandisePeriod.findUnique({ where: { id: payload.id } });

    if (!period) {
      throw new MerchandiseDocumentError("No encontramos el período que querés corregir.");
    }

    if (period.version !== baseVersion) {
      return resourceConflict(period.version, { id: period.id, kind: "period", version: period.version, label: period.label, agency: period.agency, startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), status: period.status });
    }

    if (period.status !== "VIGENTE") {
      throw new MerchandiseDocumentError("No se puede corregir un período anulado.");
    }

    const duplicate = await transaction.merchandisePeriod.findFirst({ where: { id: { not: period.id }, label: payload.label, agency: payload.agency } });

    if (duplicate) {
      throw new MerchandiseDocumentError("Ya existe un período con ese nombre y organismo.");
    }

    const updated = await transaction.merchandisePeriod.update({ where: { id: period.id }, data: { label: payload.label, agency: payload.agency, startsAt: new Date(payload.startsAt), endsAt: new Date(payload.endsAt), version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "period" } } as const;
  }

  if (payload.kind === "request") {
    const request = await transaction.merchandiseRequest.findUnique({ where: { id: payload.id }, include: { quota: true } });

    if (!request) {
      throw new MerchandiseDocumentError("No encontramos la solicitud que querés corregir.");
    }

    if (request.version !== baseVersion) {
      return resourceConflict(request.version, { id: request.id, kind: "request", version: request.version, requestNumber: request.requestNumber, requestedAt: request.requestedAt.toISOString(), requestedQuantity: request.requestedQuantity, status: request.status });
    }

    if (request.status === "CANCELADA" || request.status === "RECHAZADA") {
      throw new MerchandiseDocumentError("No se puede corregir una solicitud cancelada o rechazada.");
    }

    if (request.quota && payload.requestedQuantity < request.quota.approvedQuantity) {
      throw new MerchandiseDocumentError("La cantidad solicitada no puede ser menor al cupo aprobado.");
    }

    const duplicate = await transaction.merchandiseRequest.findFirst({ where: { id: { not: request.id }, requestNumber: payload.requestNumber } });

    if (duplicate) {
      throw new MerchandiseDocumentError("Ya existe una solicitud con ese número.");
    }

    const updated = await transaction.merchandiseRequest.update({ where: { id: request.id }, data: { requestNumber: payload.requestNumber, requestedAt: new Date(payload.requestedAt), requestedQuantity: payload.requestedQuantity, notes: payload.notes, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "request" } } as const;
  }

  if (payload.kind === "quota") {
    const quota = await transaction.merchandiseQuota.findUnique({ where: { id: payload.id }, include: { request: true } });

    if (!quota) {
      throw new MerchandiseDocumentError("No encontramos el cupo que querés corregir.");
    }

    if (quota.version !== baseVersion) {
      return resourceConflict(quota.version, { id: quota.id, kind: "quota", version: quota.version, approvedQuantity: quota.approvedQuantity, approvedAt: quota.approvedAt.toISOString() });
    }

    if (quota.request.status === "CANCELADA" || payload.approvedQuantity > quota.request.requestedQuantity) {
      throw new MerchandiseDocumentError("El cupo debe mantenerse dentro de la cantidad solicitada y de una solicitud vigente.");
    }

    const receipts = await transaction.merchandiseRemittance.aggregate({ where: { quotaId: quota.id, status: "VIGENTE" }, _sum: { receivedQuantity: true } });

    if (payload.approvedQuantity < (receipts._sum.receivedQuantity ?? 0)) {
      throw new MerchandiseDocumentError("El cupo corregido no puede ser menor a las recepciones ya registradas.");
    }

    const updated = await transaction.merchandiseQuota.update({ where: { id: quota.id }, data: { approvedQuantity: payload.approvedQuantity, approvedAt: new Date(payload.approvedAt), notes: payload.notes, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "quota" } } as const;
  }

  if (payload.kind === "remittance") {
    const remittance = await transaction.merchandiseRemittance.findUnique({ where: { id: payload.id }, include: { quota: true } });

    if (!remittance) {
      throw new MerchandiseDocumentError("No encontramos el remito que querés corregir.");
    }

    if (remittance.version !== baseVersion) {
      return resourceConflict(remittance.version, { id: remittance.id, kind: "remittance", version: remittance.version, remittanceNumber: remittance.remittanceNumber, receivedAt: remittance.receivedAt.toISOString(), receivedQuantity: remittance.receivedQuantity, responsibleName: remittance.responsibleName, status: remittance.status });
    }

    if (remittance.status !== "VIGENTE") {
      throw new MerchandiseDocumentError("No se puede corregir un remito anulado.");
    }

    const duplicate = await transaction.merchandiseRemittance.findFirst({ where: { id: { not: remittance.id }, remittanceNumber: payload.remittanceNumber } });

    if (duplicate) {
      throw new MerchandiseDocumentError("Ya existe un remito con ese número.");
    }

    const otherReceipts = await transaction.merchandiseRemittance.aggregate({ where: { quotaId: remittance.quotaId, id: { not: remittance.id }, status: "VIGENTE" }, _sum: { receivedQuantity: true } });

    if ((otherReceipts._sum.receivedQuantity ?? 0) + payload.receivedQuantity > remittance.quota.approvedQuantity) {
      throw new MerchandiseDocumentError("La cantidad corregida supera el saldo del cupo aprobado.");
    }

    const updated = await transaction.merchandiseRemittance.update({ where: { id: remittance.id }, data: { remittanceNumber: payload.remittanceNumber, receivedAt: new Date(payload.receivedAt), receivedQuantity: payload.receivedQuantity, responsibleName: payload.responsibleName, notes: payload.notes, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "remittance" } } as const;
  }

  throw new MerchandiseDocumentError("Este tipo de registro no admite correcciones.");
}

async function applyCancellation(transaction: Prisma.TransactionClient, operation: SubmittedSyncOperation, payload: Extract<MerchandiseOperationPayload, { action: "cancel" }>) {
  if (!Number.isInteger(operation.baseVersion)) {
    throw new MerchandiseDocumentError("La anulación no tiene una versión base válida.");
  }

  if (payload.kind === "period") {
    const period = await transaction.merchandisePeriod.findUnique({ where: { id: payload.id }, include: { _count: { select: { requests: true, distributionRecords: true, beneficiarySheets: true, renditions: true } } } });

    if (!period) {
      throw new MerchandiseDocumentError("No encontramos el período que querés anular.");
    }

    if (period.version !== operation.baseVersion) {
      return resourceConflict(period.version, { id: period.id, kind: "period", version: period.version, label: period.label, status: period.status });
    }

    if (period.status !== "VIGENTE" || Object.values(period._count).some((count) => count > 0)) {
      throw new MerchandiseDocumentError("El período tiene operaciones o documentación vinculada y no se puede anular. Anulá cada operación aplicable primero.");
    }

    const updated = await transaction.merchandisePeriod.update({ where: { id: period.id }, data: { status: "ANULADO", cancelledAt: new Date(), cancelledById: operation.userId, cancellationReason: payload.reason, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "period", status: "ANULADO" } } as const;
  }

  if (payload.kind === "request") {
    const request = await transaction.merchandiseRequest.findUnique({ where: { id: payload.id }, include: { quota: true, _count: { select: { remittances: true } } } });

    if (!request) {
      throw new MerchandiseDocumentError("No encontramos la solicitud que querés anular.");
    }

    if (request.version !== operation.baseVersion) {
      return resourceConflict(request.version, { id: request.id, kind: "request", version: request.version, requestNumber: request.requestNumber, status: request.status });
    }

    if (request.status === "CANCELADA" || request.quota || request._count.remittances) {
      throw new MerchandiseDocumentError("La solicitud tiene cupo o remitos vinculados y no se puede anular. La documentación se conserva; primero resolvé las operaciones dependientes.");
    }

    const updated = await transaction.merchandiseRequest.update({ where: { id: request.id }, data: { status: "CANCELADA", notes: `${request.notes ? `${request.notes}\n` : ""}Anulada: ${payload.reason}`, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "request", status: "CANCELADA" } } as const;
  }

  if (payload.kind === "remittance") {
    const remittance = await transaction.merchandiseRemittance.findUnique({ where: { id: payload.id } });

    if (!remittance) {
      throw new MerchandiseDocumentError("No encontramos el remito que querés anular.");
    }

    if (remittance.version !== operation.baseVersion) {
      return resourceConflict(remittance.version, { id: remittance.id, kind: "remittance", version: remittance.version, remittanceNumber: remittance.remittanceNumber, status: remittance.status });
    }

    if (remittance.status !== "VIGENTE") {
      throw new MerchandiseDocumentError("El remito ya está anulado.");
    }

    const updated = await transaction.merchandiseRemittance.update({ where: { id: remittance.id }, data: { status: "ANULADO", cancelledAt: new Date(), cancelledById: operation.userId, cancellationReason: payload.reason, version: { increment: 1 } } });
    return { type: "synchronized", resourceVersion: resourceVersion(updated.version), result: { resourceId: updated.id, kind: "remittance", status: "ANULADO" } } as const;
  }

  throw new MerchandiseDocumentError("Este tipo de registro no admite anulaciones.");
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
        throw new MerchandiseDocumentError("Revisá los datos del cambio pendiente de mercadería.");
      }
    }

    const parsedPayload = merchandiseOperationPayloadSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      throw new MerchandiseDocumentError("Revisá los datos del cambio pendiente de mercadería.");
    }

    const payload = parsedPayload.data;

    if (operation.resourceId !== payload.id) {
      throw new MerchandiseDocumentError("El identificador del borrador no coincide con su contenido.");
    }

    if (operation.operation === "create") {
      if (!merchandisePayloadSchema.safeParse(payload).success || operation.baseVersion !== null) {
        throw new MerchandiseDocumentError("El alta de mercadería no tiene una versión base válida.");
      }

      const parsedCreatePayload = merchandisePayloadSchema.safeParse(payload);

      if (!parsedCreatePayload.success) {
        throw new MerchandiseDocumentError("Revisá los datos del alta antes de sincronizar.");
      }

      return applyPayload(transaction, operation, parsedCreatePayload.data);
    }

    if (operation.operation === "update") {
      const parsedUpdate = merchandiseUpdatePayloadSchema.safeParse(payload);

      if (!parsedUpdate.success) {
        throw new MerchandiseDocumentError("Revisá los datos de la corrección antes de sincronizar.");
      }

      return applyUpdate(transaction, operation, parsedUpdate.data);
    }

    const cancellation = merchandiseOperationPayloadSchema.safeParse(payload);

    if (!cancellation.success || !("action" in cancellation.data)) {
      throw new MerchandiseDocumentError("Revisá los datos de la anulación antes de sincronizar.");
    }

    return applyCancellation(transaction, operation, cancellation.data);
  },
};
