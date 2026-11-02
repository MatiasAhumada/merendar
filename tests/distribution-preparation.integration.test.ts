import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";
import { AUTH } from "../src/constants/auth.constant";
import { prisma } from "../src/lib/prisma";
import { GET as getRecords } from "../src/app/api/records/route";
import { POST as postSynchronization } from "../src/app/api/synchronizations/route";
import { distributionPreparationPayloadSchema, recordsCollectionSchema } from "../src/schemas/record.schema";

function createRequest(url: string, method: string, token: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", cookie: `${AUTH.SESSION_COOKIE}=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("distribution preparations keep receipt sources and family module quantities idempotent", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(8).toString("hex");
  const user = await prisma.user.create({ data: { email: `distribution-${suffix}@example.test`, username: `distribution-${suffix}`, name: "Distribution Test Secretary", role: UserRole.SECRETARIA } });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const periodId = randomUUID();
  const familyIds = [randomUUID(), randomUUID(), randomUUID()];
  const signerIds = [randomUUID(), randomUUID()];
  const requestIds = [randomUUID(), randomUUID()];
  const quotaIds = [randomUUID(), randomUUID()];
  const remittanceIds = [randomUUID(), randomUUID()];
  const eventId = randomUUID();
  const payload = distributionPreparationPayloadSchema.parse({
    kind: "distribution-preparation", id: eventId, periodId, scheduledAt: "2026-11-05", location: "Salón comunitario", responsibleNames: "Ana Gómez y Luis Díaz", notes: "Llegar a las 8:00.",
    allocations: [
      { familyId: familyIds[0], remittanceId: remittanceIds[0], moduleQuantity: 1 },
      { familyId: familyIds[1], remittanceId: remittanceIds[0], moduleQuantity: 1 },
      { familyId: familyIds[2], remittanceId: remittanceIds[1], moduleQuantity: 2 },
    ],
  });
  const syncPayload = { operationId: randomUUID(), userId: user.id, resource: "records", resourceId: eventId, operation: "create", baseVersion: null, dependencies: [], payload };

  try {
    await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.merchandisePeriod.create({ data: { id: periodId, label: `Jornada ${suffix}`, agency: "Desarrollo Social", destination: "FAMILIES", startsAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-11-30T00:00:00Z") } });
    await prisma.family.createMany({ data: familyIds.map((id, index) => ({ id, name: `Familia sintética ${index + 1}`, neighborhood: "Barrio de prueba", address: `Calle ${index + 1}`, createdById: user.id })) });
    await prisma.person.createMany({ data: signerIds.map((id, index) => ({ id, firstName: `Integrante ${index + 1}`, lastName: "Prueba", dni: `9876543${index}` })) });
    await prisma.familyMember.createMany({ data: signerIds.map((personId) => ({ familyId: familyIds[0] as string, personId, relationship: "Integrante" })) });
    for (const [index, requestId] of requestIds.entries()) {
      await prisma.merchandiseRequest.create({ data: { id: requestId, periodId, requestNumber: `D-${suffix}-${index}`, requestedAt: new Date("2026-11-01T00:00:00Z"), requestedQuantity: index === 0 ? 2 : 3, createdById: user.id } });
      await prisma.merchandiseQuota.create({ data: { id: quotaIds[index], requestId, approvedQuantity: index === 0 ? 2 : 3, approvedAt: new Date("2026-11-01T00:00:00Z"), approvedById: user.id } });
      await prisma.merchandiseRemittance.create({ data: { id: remittanceIds[index], requestId, quotaId: quotaIds[index], remittanceNumber: `R-${suffix}-${index}`, receivedAt: new Date("2026-11-02T00:00:00Z"), receivedQuantity: index === 0 ? 2 : 3, responsibleName: "Equipo de prueba", createdById: user.id } });
    }

    const response = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, syncPayload));
    const syncResponse = await response.json() as { replayed: boolean };
    assert.equal(response.status, 200);
    assert.equal(syncResponse.replayed, false);
    const replay = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, syncPayload));
    assert.equal((await replay.json() as { replayed: boolean }).replayed, true);
    assert.equal(await prisma.distributionAllocation.count({ where: { eventId } }), 3);

    const prepared = await getRecords(createRequest("http://localhost:3000/api/records?includePeriodDetails=true", "GET", token));
    const collection = recordsCollectionSchema.parse(await prepared.json());
    const event = collection.distributionEvents.find((entry) => entry.id === eventId);
    assert.equal(event?.allocations.length, 3);
    assert.equal(event?.allocations.reduce((total, allocation) => total + allocation.moduleQuantity, 0), 4);
    assert.equal(await prisma.familyMember.count({ where: { familyId: familyIds[0] } }), 2);
    assert.equal(collection.moduleReceipts.find((entry) => entry.id === remittanceIds[0])?.remainingQuantity, 0);
    assert.equal(collection.moduleReceipts.find((entry) => entry.id === remittanceIds[1])?.remainingQuantity, 1);

    const excessiveEventId = randomUUID();
    const excessivePayload = distributionPreparationPayloadSchema.parse({ ...payload, id: excessiveEventId, allocations: [{ familyId: familyIds[0], remittanceId: remittanceIds[0], moduleQuantity: 3 }] });
    const excessiveResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, { ...syncPayload, operationId: randomUUID(), resourceId: excessiveEventId, payload: excessivePayload }));
    assert.equal(excessiveResponse.status, 400);
    assert.match(JSON.stringify(await excessiveResponse.json()), /supera los módulos recibidos/);
    assert.equal(await prisma.distributionEvent.count({ where: { id: excessiveEventId } }), 0);
  } finally {
    await prisma.distributionAllocation.deleteMany({ where: { event: { periodId } } });
    await prisma.distributionEvent.deleteMany({ where: { periodId } });
    await prisma.familyMember.deleteMany({ where: { personId: { in: signerIds } } });
    await prisma.person.deleteMany({ where: { id: { in: signerIds } } });
    await prisma.merchandiseRemittance.deleteMany({ where: { id: { in: remittanceIds } } });
    await prisma.merchandiseQuota.deleteMany({ where: { id: { in: quotaIds } } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.family.deleteMany({ where: { id: { in: familyIds } } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
