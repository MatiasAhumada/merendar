import { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { SynchronizationHandler, SubmittedSyncOperation, SyncHandlerResult } from "@/interfaces/synchronization.interface";
import type { JsonObject } from "@/types/json-value";
import { merchandisePayloadSchema, type MerchandisePayload } from "@/validations/merchandise.validation";

const MAX_DOCUMENT_BYTES = 512 * 1024;
interface DocumentInput {
  originalName: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
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

  if (!content.length || content.length > MAX_DOCUMENT_BYTES) {
    throw new MerchandiseDocumentError("El comprobante debe pesar hasta 512 KiB.");
  }

  const isPdf = document.contentType === "application/pdf" && content.subarray(0, 5).toString("ascii") === "%PDF-";
  const isJpeg = document.contentType === "image/jpeg" && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  const isPng = document.contentType === "image/png" && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  if (!isPdf && !isJpeg && !isPng) {
    throw new MerchandiseDocumentError("El contenido del comprobante no coincide con un PDF, JPEG o PNG válido.");
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

  if (!period) {
    return conflict(0, { kind: "period_missing", id: payload.periodId });
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

  if (!request) {
    return conflict(0, { kind: "request_missing", id: payload.requestId });
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

  const quota = await transaction.merchandiseQuota.findUnique({ where: { id: payload.quotaId }, include: { request: true } });

  if (!quota || quota.requestId !== payload.requestId) {
    return conflict(0, { kind: "quota_missing_or_mismatched", requestId: payload.requestId, quotaId: payload.quotaId });
  }

  const previousReceipts = await transaction.merchandiseRemittance.aggregate({
    where: { quotaId: quota.id },
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
  allowedRoles: [UserRole.PRESIDENTE, UserRole.SECRETARIA],

  async apply(transaction, operation) {
    if (operation.operation !== "create" || Number.isInteger(operation.baseVersion)) {
      throw new MerchandiseDocumentError("La recepción de mercadería solo admite altas nuevas desde la cola offline.");
    }

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

    const parsedPayload = merchandisePayloadSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      throw new MerchandiseDocumentError("Revisá los datos del cambio pendiente de mercadería.");
    }

    const payload = parsedPayload.data;

    if (operation.resourceId !== payload.id) {
      throw new MerchandiseDocumentError("El identificador del borrador no coincide con su contenido.");
    }

    return applyPayload(transaction, operation, payload);
  },
};
