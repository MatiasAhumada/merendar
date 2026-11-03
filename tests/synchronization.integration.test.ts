import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import type { SynchronizationHandler, SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/synchronizations/route";
import {
  SynchronizationConflictError,
  SynchronizationDependencyError,
  SynchronizationKeyConflictError,
} from "@/server/errors/synchronization.error";
import { synchronizationService } from "@/server/services/synchronization.service";

test("offline synchronization receipts are atomic, idempotent and bound to the originating account", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(10).toString("hex");
  const candidateKeyPrefix = `sync-test:${suffix}:`;
  const users = await Promise.all([
    prisma.user.create({ data: { email: `sync-president-${suffix}@example.test`, username: `sync-president-${suffix}`, name: "Sync Test President", role: UserRole.PRESIDENTE } }),
    prisma.user.create({ data: { email: `sync-secretary-${suffix}@example.test`, username: `sync-secretary-${suffix}`, name: "Sync Test Secretary", role: UserRole.SECRETARIA } }),
  ]);
  const operationId = randomUUID();
  const operation: SubmittedSyncOperation = {
    operationId,
    userId: users[0].id,
    resource: "records",
    resourceId: `record-${suffix}`,
    operation: "create",
    baseVersion: null,
    dependencies: [],
    payload: { title: "Offline record" },
  };
  const handler: SynchronizationHandler = {
    async apply(transaction, submittedOperation) {
      await transaction.loginAttempt.create({ data: { candidateKey: `${candidateKeyPrefix}${submittedOperation.operationId}` } });
      return {
        type: "synchronized",
        resourceVersion: 1,
        result: { resourceId: submittedOperation.resourceId },
      };
    },
  };

  try {
    const [firstResult, replayResult] = await Promise.all([
      synchronizationService.apply(operation, "RECORDS", handler),
      synchronizationService.apply(operation, "RECORDS", handler),
    ]);
    const repeatedResponse = await synchronizationService.apply(operation, "RECORDS", handler);
    const persistedAttemptCount = await prisma.loginAttempt.count({ where: { candidateKey: `${candidateKeyPrefix}${operationId}` } });

    assert.notEqual(firstResult.replayed, replayResult.replayed);
    assert.equal(repeatedResponse.replayed, true);
    assert.equal(replayResult.operationId, firstResult.operationId);
    assert.equal(persistedAttemptCount, 1);

    await assert.rejects(
      synchronizationService.apply({ ...operation, payload: { title: "Changed payload" } }, "RECORDS", handler),
      SynchronizationKeyConflictError,
    );
    await assert.rejects(
      synchronizationService.apply({ ...operation, userId: users[1].id }, "RECORDS", handler),
      SynchronizationKeyConflictError,
    );

    const missingParentOperation = { ...operation, operationId: randomUUID(), dependencies: [randomUUID()] };
    await assert.rejects(
      synchronizationService.apply(missingParentOperation, "RECORDS", handler),
      SynchronizationDependencyError,
    );

    const conflictingOperation = { ...operation, operationId: randomUUID() };
    const conflictHandler: SynchronizationHandler = {
      async apply(transaction, submittedOperation) {
        await transaction.loginAttempt.create({ data: { candidateKey: `${candidateKeyPrefix}${submittedOperation.operationId}` } });
        return { type: "conflict", resourceVersion: 4, current: { title: "Server record" } };
      },
    };
    await assert.rejects(
      synchronizationService.apply(conflictingOperation, "RECORDS", conflictHandler),
      SynchronizationConflictError,
    );
    const rolledBackConflictWrite = await prisma.loginAttempt.count({ where: { candidateKey: `${candidateKeyPrefix}${conflictingOperation.operationId}` } });
    assert.equal(rolledBackConflictWrite, 0);
  } finally {
    await prisma.loginAttempt.deleteMany({ where: { candidateKey: { startsWith: candidateKeyPrefix } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  }
});

test("synchronization endpoint rejects cross-origin, expired, cross-account and malformed record operations", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const suffix = randomBytes(10).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `sync-route-${suffix}@example.test`,
      username: `sync-route-${suffix}`,
      name: "Sync Route Test",
      role: UserRole.PRESIDENTE,
    },
  });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
  const operation = {
    operationId: randomUUID(),
    userId: user.id,
    resource: "records",
    resourceId: `record-${suffix}`,
    operation: "create",
    baseVersion: null,
    dependencies: [],
    payload: { title: "Offline record" },
  };

  function createRequest(body: unknown, sessionToken?: string, origin = "http://localhost:3000") {
    const headers = new Headers({ origin, host: "localhost:3000" });

    if (sessionToken) {
      headers.set("cookie", `${AUTH.SESSION_COOKIE}=${sessionToken}`);
    }

    headers.set("content-type", "application/json");
    return new NextRequest("http://localhost:3000/api/synchronizations", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  try {
    assert.equal((await POST(createRequest(operation, token, "https://outside.example"))).status, 403);
    assert.equal((await POST(createRequest(operation))).status, 401);
    assert.equal((await POST(createRequest({ ...operation, userId: `another-${user.id}` }, token))).status, 403);
    assert.equal((await POST(createRequest(operation, token))).status, 400);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    assert.equal((await POST(createRequest(operation, token))).status, 401);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
