import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { GET as getPrivateDocument } from "@/app/api/merchandise/documents/[id]/route";
import { POST as postSynchronization } from "@/app/api/synchronizations/route";
import { prisma } from "@/lib/prisma";
import { SynchronizationConflictError } from "@/server/errors/synchronization.error";
import { merchandiseSynchronizationHandler } from "@/server/services/merchandise-synchronization.service";
import { synchronizationService } from "@/server/services/synchronization.service";
import type { JsonValue } from "@/types/json-value";
import { merchandisePayloadSchema } from "@/schemas/merchandise.schema";

test("merchandise document policy accepts valid PDFs up to 512 KiB and rejects images or larger files", () => {
  const validPdf = Buffer.alloc(512 * 1024, 32);
  validPdf.write("%PDF-1.7", 0, "ascii");
  validPdf.write("%%EOF", validPdf.length - 5, "ascii");
  const basePayload = {
    kind: "request" as const,
    id: randomUUID(),
    periodId: randomUUID(),
    requestNumber: "REQ-PDF",
    requestedAt: "2026-10-02",
    requestedQuantity: 2,
  };

  assert.equal(merchandisePayloadSchema.safeParse({
    ...basePayload,
    document: { originalName: "proof.pdf", contentType: "application/pdf", contentBase64: validPdf.toString("base64") },
  }).success, true);
  assert.equal(merchandisePayloadSchema.safeParse({
    ...basePayload,
    document: { originalName: "proof.jpg", contentType: "image/jpeg", contentBase64: Buffer.from("image").toString("base64") },
  }).success, false);
  assert.equal(merchandisePayloadSchema.safeParse({
    ...basePayload,
    document: { originalName: "proof.pdf", contentType: "application/pdf", contentBase64: Buffer.concat([validPdf, Buffer.from(" ")]).toString("base64") },
  }).success, false);
});

function createOperation(
  userId: string,
  resourceId: string,
  payload: Record<string, JsonValue>,
  dependencies: string[] = [],
  operation: "create" | "update" | "delete" = "create",
  baseVersion: number | null = null,
): SubmittedSyncOperation {
  return {
    operationId: randomUUID(),
    userId,
    resource: "remittances",
    resourceId,
    operation,
    baseVersion,
    dependencies,
    payload,
  };
}

function createRequest(body: unknown, token: string) {
  return new NextRequest("http://localhost:3000/api/synchronizations", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
      cookie: `${AUTH.SESSION_COOKIE}=${token}`,
    },
    body: JSON.stringify(body),
  });
}

test("merchandise periods, requests, quotas, remittances and private documents persist atomically", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(10).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `merchandise-${suffix}@example.test`,
      username: `merchandise-${suffix}`,
      name: "Merchandise Test Secretary",
      role: UserRole.SECRETARIA,
    },
  });
  const periodId = randomUUID();
  const requestId = randomUUID();
  const quotaId = randomUUID();
  const remittanceId = randomUUID();
  const supplyPeriodId = randomUUID();
  const supplyRequestId = randomUUID();
  const supplyQuotaId = randomUUID();
  const supplyRemittanceId = randomUUID();
  const secondSupplyRemittanceId = randomUUID();
  let apiPeriodId = "";
  let unauthorizedUserId = "";
  const pdfContent = Buffer.from("%PDF-1.7 test document\n%%EOF").toString("base64");
  const periodOperation = createOperation(user.id, periodId, {
    kind: "period",
    id: periodId,
    label: `Test October ${suffix}`,
    agency: "Development Social Ministry",
    startsAt: "2026-10-01",
    endsAt: "2026-10-31",
  });
  const requestOperation = createOperation(user.id, requestId, {
    kind: "request",
    id: requestId,
    periodId,
    requestNumber: `REQ-${suffix}`,
    requestedAt: "2026-10-02",
    requestedQuantity: 80,
    notes: "Integration workflow",
  }, [periodOperation.operationId]);
  const quotaOperation = createOperation(user.id, quotaId, {
    kind: "quota",
    id: quotaId,
    requestId,
    approvedQuantity: 40,
    approvedAt: "2026-10-03",
  }, [requestOperation.operationId]);
  const remittanceOperation = createOperation(user.id, remittanceId, {
    kind: "remittance",
    id: remittanceId,
    requestId,
    quotaId,
    remittanceNumber: `REM-${suffix}`,
    receivedAt: "2026-10-04",
    receivedQuantity: 30,
    responsibleName: "Test Receiver",
    document: {
      originalName: "delivery.pdf",
      contentType: "application/pdf",
      contentBase64: pdfContent,
    },
  }, [requestOperation.operationId, quotaOperation.operationId]);

  try {
    await synchronizationService.apply(periodOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    await synchronizationService.apply(requestOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    await synchronizationService.apply(quotaOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const firstResponse = await synchronizationService.apply(remittanceOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const replayResponse = await synchronizationService.apply(remittanceOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const savedPeriod = await prisma.merchandisePeriod.findUnique({
      where: { id: periodId },
      include: { requests: { include: { quota: true, remittances: { include: { documents: true } } } } },
    });

    assert.equal(firstResponse.replayed, false);
    assert.equal(replayResponse.replayed, true);
    assert.equal(savedPeriod?.requests[0]?.status, "APROBADA");
    assert.equal(savedPeriod?.requests[0]?.quota?.approvedQuantity.toNumber(), 40);
    assert.equal(savedPeriod?.requests[0]?.remittances[0]?.receivedQuantity.toNumber(), 30);
    assert.equal(Buffer.from(savedPeriod?.requests[0]?.remittances[0]?.documents[0]?.content ?? new Uint8Array()).toString(), "%PDF-1.7 test document\n%%EOF");

    const supplyPeriodOperation = createOperation(user.id, supplyPeriodId, {
      kind: "period",
      id: supplyPeriodId,
      label: `Test supply cycle ${suffix}`,
      agency: "Development Social Ministry",
      destination: "MERENDERO",
      startsAt: "2026-10-01",
      endsAt: "2026-10-31",
    });
    const supplyRequestOperation = createOperation(user.id, supplyRequestId, {
      kind: "request",
      id: supplyRequestId,
      periodId: supplyPeriodId,
      requestNumber: `SUP-${suffix}`,
      requestedAt: "2026-10-02",
      requestedQuantity: 1.25,
      item: { productName: "Aceite", presentation: "Botella de 900 ml", unit: "litro", requestedQuantity: 1.25 },
    }, [supplyPeriodOperation.operationId]);
    const supplyQuotaOperation = createOperation(user.id, supplyQuotaId, {
      kind: "quota",
      id: supplyQuotaId,
      requestId: supplyRequestId,
      approvedQuantity: 1.25,
      approvedAt: "2026-10-03",
    }, [supplyRequestOperation.operationId]);
    const supplyReceiptOperation = createOperation(user.id, supplyRemittanceId, {
      kind: "remittance",
      id: supplyRemittanceId,
      requestId: supplyRequestId,
      quotaId: supplyQuotaId,
      remittanceNumber: `SUP-REM-1-${suffix}`,
      receivedAt: "2026-10-04",
      receivedQuantity: 0.75,
      responsibleName: "Test Receiver",
    }, [supplyRequestOperation.operationId, supplyQuotaOperation.operationId]);
    const secondSupplyReceiptOperation = createOperation(user.id, secondSupplyRemittanceId, {
      kind: "remittance",
      id: secondSupplyRemittanceId,
      requestId: supplyRequestId,
      quotaId: supplyQuotaId,
      remittanceNumber: `SUP-REM-2-${suffix}`,
      receivedAt: "2026-10-05",
      receivedQuantity: 0.5,
      responsibleName: "Test Receiver",
    }, [supplyRequestOperation.operationId, supplyQuotaOperation.operationId, supplyReceiptOperation.operationId]);
    await synchronizationService.apply(supplyPeriodOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    await synchronizationService.apply(supplyRequestOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    await synchronizationService.apply(supplyQuotaOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    await synchronizationService.apply(supplyReceiptOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    await synchronizationService.apply(secondSupplyReceiptOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const savedSupplyRequest = await prisma.merchandiseRequest.findUniqueOrThrow({
      where: { id: supplyRequestId },
      include: { items: true, quota: { include: { items: true } }, remittances: { include: { items: true } } },
    });
    assert.equal(savedSupplyRequest.items[0]?.productName, "Aceite");
    assert.equal(savedSupplyRequest.items[0]?.presentation, "Botella de 900 ml");
    assert.equal(savedSupplyRequest.items[0]?.unit, "litro");
    assert.equal(savedSupplyRequest.items[0]?.requestedQuantity.toNumber(), 1.25);
    assert.equal(savedSupplyRequest.quota?.items[0]?.authorizedQuantity.toNumber(), 1.25);
    assert.deepEqual(savedSupplyRequest.remittances.map((remittance) => remittance.items[0]?.receivedQuantity.toNumber()).sort(), [0.5, 0.75]);
    assert.equal(savedSupplyRequest.remittances.reduce((total, remittance) => total + remittance.receivedQuantity.toNumber(), 0), 1.25);

    const invalidFamilyRequestId = randomUUID();
    const invalidFamilyRequest = createOperation(user.id, invalidFamilyRequestId, {
      kind: "request",
      id: invalidFamilyRequestId,
      periodId,
      requestNumber: `FRACTIONAL-${suffix}`,
      requestedAt: "2026-10-02",
      requestedQuantity: 1.5,
    }, [periodOperation.operationId]);
    await assert.rejects(
      synchronizationService.apply(invalidFamilyRequest, "REMITTANCES", merchandiseSynchronizationHandler),
      SynchronizationConflictError,
    );

    const overQuotaId = randomUUID();
    const overQuotaOperation = createOperation(user.id, overQuotaId, {
      kind: "remittance",
      id: overQuotaId,
      requestId,
      quotaId,
      remittanceNumber: `OVER-${suffix}`,
      receivedAt: "2026-10-05",
      receivedQuantity: 11,
      responsibleName: "Test Receiver",
    }, [requestOperation.operationId, quotaOperation.operationId]);
    await assert.rejects(
      synchronizationService.apply(overQuotaOperation, "REMITTANCES", merchandiseSynchronizationHandler),
      SynchronizationConflictError,
    );

    const originalRemittance = await prisma.merchandiseRemittance.findUniqueOrThrow({ where: { id: remittanceId } });
    const correctionOperation = createOperation(user.id, remittanceId, {
      kind: "remittance",
      id: remittanceId,
      remittanceNumber: `REM-CORRECTED-${suffix}`,
      receivedAt: "2026-10-04",
      receivedQuantity: 35,
      responsibleName: "Corrected Receiver",
      notes: "Corrected quantity",
    }, [], "update", originalRemittance.version);
    const correctionResponse = await synchronizationService.apply(correctionOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const correctedRemittance = await prisma.merchandiseRemittance.findUniqueOrThrow({ where: { id: remittanceId }, include: { documents: true } });
    assert.equal(correctedRemittance.receivedQuantity.toNumber(), 35);
    assert.equal(correctedRemittance.documents.length, 1);

    const staleCorrection = createOperation(user.id, remittanceId, {
      kind: "remittance",
      id: remittanceId,
      remittanceNumber: `REM-STALE-${suffix}`,
      receivedAt: "2026-10-04",
      receivedQuantity: 32,
      responsibleName: "Stale Receiver",
    }, [], "update", originalRemittance.version);
    await assert.rejects(
      synchronizationService.apply(staleCorrection, "REMITTANCES", merchandiseSynchronizationHandler),
      SynchronizationConflictError,
    );

    const cancelOperation = createOperation(user.id, remittanceId, {
      kind: "remittance",
      id: remittanceId,
      action: "cancel",
      reason: "Se registró una cantidad incorrecta",
    }, [], "delete", correctionResponse.resourceVersion);
    await synchronizationService.apply(cancelOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const cancelledRemittance = await prisma.merchandiseRemittance.findUniqueOrThrow({ where: { id: remittanceId }, include: { documents: true } });
    assert.equal(cancelledRemittance.status, "ANULADO");
    assert.equal(cancelledRemittance.cancellationReason, "Se registró una cantidad incorrecta");
    assert.equal(cancelledRemittance.documents.length, 1);

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    apiPeriodId = randomUUID();
    const apiPeriodOperation = createOperation(user.id, apiPeriodId, {
      kind: "period",
      id: apiPeriodId,
      label: `API Test October ${suffix}`,
      agency: "Development Social Ministry",
      startsAt: "2026-10-01",
      endsAt: "2026-10-31",
    });
    const apiPeriodResponse = await postSynchronization(createRequest(apiPeriodOperation, token));
    assert.equal(apiPeriodResponse.status, 200);
    const savedDocument = await prisma.merchandiseDocument.findFirst({ where: { remittanceId }, select: { id: true } });
    assert.ok(savedDocument);
    const downloadResponse = await getPrivateDocument(
      new NextRequest(`http://localhost:3000/api/merchandise/documents/${savedDocument.id}`, {
        headers: { host: "localhost:3000", cookie: `${AUTH.SESSION_COOKIE}=${token}` },
      }),
      { params: Promise.resolve({ id: savedDocument.id }) },
    );
    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadResponse.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(await downloadResponse.text(), "%PDF-1.7 test document\n%%EOF");

    const unauthorizedUser = await prisma.user.create({
      data: { email: `merchandise-reader-${suffix}@example.test`, name: "Unprivileged Test User", role: UserRole.TESORERIA },
    });
    unauthorizedUserId = unauthorizedUser.id;
    const unauthorizedToken = randomBytes(32).toString("hex");
    const unauthorizedHash = createHash("sha256").update(unauthorizedToken).digest("hex");
    await prisma.authSession.create({ data: { userId: unauthorizedUser.id, tokenHash: unauthorizedHash, expiresAt: new Date(Date.now() + 60_000) } });
    const deniedOperationId = randomUUID();
    const deniedResponse = await postSynchronization(createRequest({
      operationId: randomUUID(),
      userId: unauthorizedUser.id,
      resource: "remittances",
      resourceId: deniedOperationId,
      operation: "create",
      baseVersion: null,
      dependencies: [],
      payload: { kind: "period", id: deniedOperationId, label: "Denied", agency: "Denied", startsAt: "2026-10-01", endsAt: "2026-10-31" },
    }, unauthorizedToken));
    assert.equal(deniedResponse.status, 403);
    const deniedDocumentResponse = await getPrivateDocument(
      new NextRequest(`http://localhost:3000/api/merchandise/documents/${savedDocument.id}`, {
        headers: { host: "localhost:3000", cookie: `${AUTH.SESSION_COOKIE}=${unauthorizedToken}` },
      }),
      { params: Promise.resolve({ id: savedDocument.id }) },
    );
    assert.equal(deniedDocumentResponse.status, 403);
  } finally {
    if (unauthorizedUserId) {
      await prisma.user.deleteMany({ where: { id: unauthorizedUserId } });
    }
    await prisma.merchandiseDocument.deleteMany({ where: { OR: [{ requestId }, { remittanceId }, { uploadedById: user.id }] } });
    await prisma.merchandiseReceiptItem.deleteMany({ where: { remittanceId: { in: [supplyRemittanceId, secondSupplyRemittanceId] } } });
    await prisma.merchandiseRemittance.deleteMany({ where: { id: { in: [supplyRemittanceId, secondSupplyRemittanceId] } } });
    await prisma.merchandiseQuotaItem.deleteMany({ where: { quotaId: supplyQuotaId } });
    await prisma.merchandiseQuota.deleteMany({ where: { id: supplyQuotaId } });
    await prisma.merchandiseRequestItem.deleteMany({ where: { requestId: supplyRequestId } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: supplyRequestId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: supplyPeriodId } });
    await prisma.merchandiseRemittance.deleteMany({ where: { requestId } });
    await prisma.merchandiseQuota.deleteMany({ where: { requestId } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: requestId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: apiPeriodId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
