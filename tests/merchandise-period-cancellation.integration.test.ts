import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { prisma } from "@/lib/prisma";
import { SynchronizationConflictError } from "@/server/errors/synchronization.error";
import { merchandiseSynchronizationHandler } from "@/server/services/merchandise-synchronization.service";
import { synchronizationService } from "@/server/services/synchronization.service";
import type { JsonObject } from "@/types/json-value";

function createMerchandiseOperation(
  userId: string,
  resourceId: string,
  payload: JsonObject,
  operation: "create" | "delete" = "create",
  baseVersion: number | null = null,
): SubmittedSyncOperation {
  return {
    operationId: randomUUID(),
    userId,
    resource: "remittances",
    resourceId,
    operation,
    baseVersion,
    dependencies: [],
    payload,
  };
}

test("periods with merchandise history can be cancelled and reject queued operations", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(8).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `period-cancellation-${suffix}@example.test`,
      username: `period-cancellation-${suffix}`,
      name: "Period Cancellation QA",
      role: UserRole.PRESIDENTE,
    },
  });
  const periodId = randomUUID();
  const requestId = randomUUID();
  const queuedRequestId = randomUUID();
  const periodOperation = createMerchandiseOperation(user.id, periodId, {
    kind: "period",
    id: periodId,
    label: `Period cancellation ${suffix}`,
    agency: "Development Ministry",
    startsAt: "2026-11-01",
    endsAt: "2026-11-30",
  });
  const requestOperation = createMerchandiseOperation(user.id, requestId, {
    kind: "request",
    id: requestId,
    periodId,
    requestNumber: `PCR-${suffix}`,
    requestedAt: "2026-11-02",
    requestedQuantity: 2,
  });
  const queuedRequestOperation = createMerchandiseOperation(user.id, queuedRequestId, {
    kind: "request",
    id: queuedRequestId,
    periodId,
    requestNumber: `PCR-QUEUED-${suffix}`,
    requestedAt: "2026-11-03",
    requestedQuantity: 1,
  });
  const cancellationOperation = createMerchandiseOperation(user.id, periodId, {
    kind: "period",
    id: periodId,
    action: "cancel",
    reason: "El organismo corrigió el calendario del ciclo.",
  }, "delete", 1);

  try {
    const periodCreate = await synchronizationService.apply(periodOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const periodReplay = await synchronizationService.apply(periodOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    assert.equal(periodCreate.replayed, false);
    assert.equal(periodReplay.replayed, true);
    await synchronizationService.apply(requestOperation, "REMITTANCES", merchandiseSynchronizationHandler);

    await synchronizationService.apply(cancellationOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const cancelledPeriod = await prisma.merchandisePeriod.findUnique({
      where: { id: periodId },
      include: { cancelledBy: true, requests: true },
    });

    assert.equal(cancelledPeriod?.status, "ANULADO");
    assert.ok(cancelledPeriod?.cancelledAt);
    assert.equal(cancelledPeriod?.cancelledById, user.id);
    assert.equal(cancelledPeriod?.cancelledBy?.name, user.name);
    assert.equal(cancelledPeriod?.cancellationReason, "El organismo corrigió el calendario del ciclo.");
    assert.equal(cancelledPeriod?.requests.length, 1);
    assert.equal(cancelledPeriod?.requests[0]?.id, requestId);

    await assert.rejects(
      synchronizationService.apply(queuedRequestOperation, "REMITTANCES", merchandiseSynchronizationHandler),
      SynchronizationConflictError,
    );
    assert.equal(await prisma.merchandiseRequest.count({ where: { id: queuedRequestId } }), 0);
  } finally {
    await prisma.synchronizationReceipt.deleteMany({ where: { userId: user.id } });
    await prisma.merchandiseRequest.deleteMany({ where: { periodId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test("period cancellation serializes against a concurrent request creation", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const suffix = randomBytes(8).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `period-race-${suffix}@example.test`,
      username: `period-race-${suffix}`,
      name: "Period Race QA",
      role: UserRole.PRESIDENTE,
    },
  });
  const periodId = randomUUID();
  const racingRequestId = randomUUID();
  const delayedRequestId = randomUUID();
  const periodOperation = createMerchandiseOperation(user.id, periodId, {
    kind: "period",
    id: periodId,
    label: `Period race ${suffix}`,
    agency: "Development Ministry",
    startsAt: "2026-11-01",
    endsAt: "2026-11-30",
  });
  const racingRequestOperation = createMerchandiseOperation(user.id, racingRequestId, {
    kind: "request",
    id: racingRequestId,
    periodId,
    requestNumber: `PRR-${suffix}`,
    requestedAt: "2026-11-02",
    requestedQuantity: 2,
  });
  const cancellationOperation = createMerchandiseOperation(user.id, periodId, {
    kind: "period",
    id: periodId,
    action: "cancel",
    reason: "El organismo corrigió el calendario.",
  }, "delete", 1);
  const delayedRequestOperation = createMerchandiseOperation(user.id, delayedRequestId, {
    kind: "request",
    id: delayedRequestId,
    periodId,
    requestNumber: `PRR-DELAYED-${suffix}`,
    requestedAt: "2026-11-03",
    requestedQuantity: 1,
  });

  try {
    await synchronizationService.apply(periodOperation, "REMITTANCES", merchandiseSynchronizationHandler);
    const raceResults = await Promise.allSettled([
      synchronizationService.apply(racingRequestOperation, "REMITTANCES", merchandiseSynchronizationHandler),
      synchronizationService.apply(cancellationOperation, "REMITTANCES", merchandiseSynchronizationHandler),
    ]);
    const requestResult = raceResults[0];
    const cancellationResult = raceResults[1];
    if (requestResult.status === "rejected") {
      assert.ok(requestResult.reason instanceof SynchronizationConflictError);
    }
    assert.equal(cancellationResult.status, "fulfilled");

    const savedPeriod = await prisma.merchandisePeriod.findUniqueOrThrow({ where: { id: periodId } });
    const racingRequest = await prisma.merchandiseRequest.findUnique({ where: { id: racingRequestId } });
    assert.equal(savedPeriod.status, "ANULADO");
    assert.ok(savedPeriod.cancelledAt);
    if (racingRequest) {
      assert.ok(racingRequest.createdAt <= savedPeriod.cancelledAt);
    }

    await assert.rejects(
      synchronizationService.apply(delayedRequestOperation, "REMITTANCES", merchandiseSynchronizationHandler),
      SynchronizationConflictError,
    );
    assert.equal(await prisma.merchandiseRequest.count({ where: { id: delayedRequestId } }), 0);
  } finally {
    await prisma.synchronizationReceipt.deleteMany({ where: { userId: user.id } });
    await prisma.merchandiseRequest.deleteMany({ where: { periodId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
