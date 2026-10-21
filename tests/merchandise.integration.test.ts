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
import { SynchronizationConflictError } from "@/server/repository/synchronization.repository";
import { merchandiseSynchronizationHandler } from "@/server/services/merchandise-synchronization.service";
import { synchronizationService } from "@/server/services/synchronization.service";
import type { JsonValue } from "@/types/json-value";

function createOperation(
  userId: string,
  resourceId: string,
  payload: Record<string, JsonValue>,
  dependencies: string[] = [],
): SubmittedSyncOperation {
  return {
    operationId: randomUUID(),
    userId,
    resource: "remittances",
    resourceId,
    operation: "create",
    baseVersion: null,
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
  let apiPeriodId = "";
  let unauthorizedUserId = "";
  const pdfContent = Buffer.from("%PDF-1.7 test document").toString("base64");
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
    assert.equal(savedPeriod?.requests[0]?.quota?.approvedQuantity, 40);
    assert.equal(savedPeriod?.requests[0]?.remittances[0]?.receivedQuantity, 30);
    assert.equal(Buffer.from(savedPeriod?.requests[0]?.remittances[0]?.documents[0]?.content ?? new Uint8Array()).toString(), "%PDF-1.7 test document");

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
    assert.equal(await downloadResponse.text(), "%PDF-1.7 test document");

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
    await prisma.merchandiseRemittance.deleteMany({ where: { requestId } });
    await prisma.merchandiseQuota.deleteMany({ where: { requestId } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: requestId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: apiPeriodId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
