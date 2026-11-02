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
import { beneficiarySheetDraftSchema, distributionPreparationPayloadSchema, distributionRecordPayloadSchema, familyDeliveryPayloadSchema, recordsCollectionSchema } from "../src/schemas/record.schema";

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
  const signerIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const familyMemberIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
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
  const supplyPeriodId = randomUUID();
  const supplyRequestId = randomUUID();
  const supplyQuotaId = randomUUID();
  const supplyRequestItemId = randomUUID();
  const supplyQuotaItemId = randomUUID();
  const supplyRemittanceId = randomUUID();
  const supplyReceiptItemId = randomUUID();
  const supplyEventId = randomUUID();
  const excessiveSupplyId = randomUUID();

  try {
    await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.merchandisePeriod.create({ data: { id: periodId, label: `Jornada ${suffix}`, agency: "Desarrollo Social", destination: "FAMILIES", startsAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-11-30T00:00:00Z") } });
    await prisma.family.createMany({ data: familyIds.map((id, index) => ({ id, name: `Familia sintética ${index + 1}`, neighborhood: "Barrio de prueba", address: `Calle ${index + 1}`, createdById: user.id })) });
    await prisma.person.createMany({ data: signerIds.map((id, index) => ({ id, firstName: `Integrante ${index + 1}`, lastName: "Prueba", dni: `9876543${index}` })) });
    await prisma.familyMember.createMany({ data: signerIds.map((personId, index) => ({ id: familyMemberIds[index], familyId: familyIds[index < 2 ? 0 : index - 1] as string, personId, relationship: "Integrante" })) });
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

    const firstDeliveryId = randomUUID();
    const firstDeliveryPayload = familyDeliveryPayloadSchema.parse({
      kind: "family-delivery",
      id: firstDeliveryId,
      eventId,
      familyId: familyIds[0],
      participants: [
        { familyMemberId: familyMemberIds[0], paperSignatureChecked: true, physicalDniChecked: true },
        { familyMemberId: familyMemberIds[1], paperSignatureChecked: false, physicalDniChecked: true },
      ],
    });
    const firstDeliverySync = { ...syncPayload, operationId: randomUUID(), resourceId: firstDeliveryId, payload: firstDeliveryPayload };
    const firstDeliveryResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, firstDeliverySync));
    assert.equal(firstDeliveryResponse.status, 200);
    const firstDeliveryReplay = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, firstDeliverySync));
    assert.equal((await firstDeliveryReplay.json() as { replayed: boolean }).replayed, true);
    assert.equal(await prisma.familyDelivery.aggregate({ where: { id: firstDeliveryId }, _sum: { moduleQuantity: true } }).then((result) => result._sum.moduleQuantity), 1);
    assert.equal(await prisma.distributionParticipant.count({ where: { familyDeliveryId: firstDeliveryId } }), 2);

    const blockedMemberDeactivation = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, {
      ...syncPayload, operationId: randomUUID(), resource: "families", resourceId: familyIds[0], operation: "delete", baseVersion: 1,
      payload: { kind: "member", memberId: familyMemberIds[0] },
    }));
    assert.equal(blockedMemberDeactivation.status, 409);
    const blockedFamilyDeactivation = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, {
      ...syncPayload, operationId: randomUUID(), resource: "families", resourceId: familyIds[0], operation: "delete", baseVersion: 1,
      payload: { kind: "family" },
    }));
    assert.equal(blockedFamilyDeactivation.status, 409);

    const secondFamilyDeliveryId = randomUUID();
    const secondFamilyDeliveryPayload = familyDeliveryPayloadSchema.parse({
      kind: "family-delivery",
      id: secondFamilyDeliveryId,
      eventId,
      familyId: familyIds[1],
      participants: [{ familyMemberId: familyMemberIds[2], paperSignatureChecked: true, physicalDniChecked: false }],
    });
    const secondFamilyDeliverySync = { ...syncPayload, operationId: randomUUID(), resourceId: secondFamilyDeliveryId, payload: secondFamilyDeliveryPayload };
    const secondFamilyDeliveryResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, secondFamilyDeliverySync));
    assert.equal(secondFamilyDeliveryResponse.status, 200);
    assert.equal(await prisma.familyDelivery.aggregate({ where: { eventId, familyId: { in: [familyIds[0], familyIds[1]] } }, _sum: { moduleQuantity: true } }).then((result) => result._sum.moduleQuantity), 2);

    const competingDeliveryIds = [randomUUID(), randomUUID()];
    const competingResponses = await Promise.all(competingDeliveryIds.map((deliveryId) => {
      const competingPayload = familyDeliveryPayloadSchema.parse({
        kind: "family-delivery",
        id: deliveryId,
        eventId,
        familyId: familyIds[2],
        participants: [{ familyMemberId: familyMemberIds[3], paperSignatureChecked: false, physicalDniChecked: true }],
      });
      return postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, { ...syncPayload, operationId: randomUUID(), resourceId: deliveryId, payload: competingPayload }));
    }));
    assert.deepEqual(competingResponses.map((entry) => entry.status).sort(), [200, 409]);
    assert.equal(await prisma.familyDelivery.count({ where: { eventId, familyId: familyIds[2] } }), 1);
    const deliveredCollectionResponse = await getRecords(createRequest("http://localhost:3000/api/records?includePeriodDetails=true", "GET", token));
    const deliveredCollection = recordsCollectionSchema.parse(await deliveredCollectionResponse.json());
    const deliveredEvent = deliveredCollection.distributionEvents.find((entry) => entry.id === eventId);
    assert.equal(deliveredEvent?.familyDeliveries.length, 3);
    assert.equal(deliveredEvent?.familyDeliveries.find((delivery) => delivery.id === firstDeliveryId)?.participants.length, 2);
    assert.equal(deliveredEvent?.familyDeliveries.find((delivery) => delivery.id === firstDeliveryId)?.participants[0]?.physicalDniChecked, true);

    const legacyRecordId = randomUUID();
    const legacyRecordPayload = distributionRecordPayloadSchema.parse({
      kind: "distribution-record", id: legacyRecordId, periodId, familyId: familyIds[0], personId: signerIds[0],
      receivedAt: "2026-11-05", moduleType: "Módulo familiar", quantity: 1, physicalDniChecked: true, documentsChecked: true,
    });
    const legacyRecordResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, {
      ...syncPayload, operationId: randomUUID(), resourceId: legacyRecordId, payload: legacyRecordPayload,
    }));
    assert.equal(legacyRecordResponse.status, 409);
    assert.match(JSON.stringify(await legacyRecordResponse.json()), /Registrá el retiro desde la jornada/);

    const eventSheetId = randomUUID();
    const eventSheetPayload = beneficiarySheetDraftSchema.parse({
      kind: "beneficiary-sheet", id: eventSheetId, periodId, distributionEventId: eventId,
      event: { scheduledAt: "2026-11-05", location: "Salón comunitario", responsibleNames: "Ana Gómez y Luis Díaz" },
      period: { label: `Jornada ${suffix}`, agency: "Desarrollo Social", startsAt: "2026-11-01", endsAt: "2026-11-30" },
      templateVersion: 2,
      beneficiaries: [
        { personId: signerIds[0], familyMemberId: familyMemberIds[0], familyDeliveryId: firstDeliveryId, name: "Integrante 1 Prueba", dni: "98765430", familyName: "Familia sintética 1", address: "Calle 1", neighborhood: "Barrio de prueba", paperSignatureChecked: true, physicalDniChecked: true },
        { personId: signerIds[1], familyMemberId: familyMemberIds[1], familyDeliveryId: firstDeliveryId, name: "Integrante 2 Prueba", dni: "98765431", familyName: "Familia sintética 1", address: "Calle 1", neighborhood: "Barrio de prueba", paperSignatureChecked: false, physicalDniChecked: true },
        { personId: signerIds[2], familyMemberId: familyMemberIds[2], familyDeliveryId: secondFamilyDeliveryId, name: "Integrante 3 Prueba", dni: "98765432", familyName: "Familia sintética 2", address: "Calle 2", neighborhood: "Barrio de prueba", paperSignatureChecked: true, physicalDniChecked: false },
      ],
    });
    const eventSheetOperation = { ...syncPayload, operationId: randomUUID(), resourceId: eventSheetId, payload: eventSheetPayload };
    const eventSheetResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, eventSheetOperation));
    assert.equal(eventSheetResponse.status, 200);
    const eventSheet = await prisma.beneficiarySheet.findUnique({ where: { id: eventSheetId } });
    assert.equal(eventSheet?.distributionEventId, eventId);
    const eventSnapshot = eventSheet?.snapshot as { event: { id: string }; beneficiaries: Array<{ familyDeliveryId: string; paperSignatureChecked: boolean; physicalDniChecked: boolean }> };
    assert.equal(eventSnapshot.event.id, eventId);
    assert.deepEqual(eventSnapshot.beneficiaries.slice(0, 2).map((participant) => participant.familyDeliveryId), [firstDeliveryId, firstDeliveryId]);
    assert.equal(eventSnapshot.beneficiaries[1]?.paperSignatureChecked, false);
    assert.equal(eventSnapshot.beneficiaries[1]?.physicalDniChecked, true);

    const renditionId = randomUUID();
    const signedPdf = Buffer.from("%PDF-1.7\nSynthetic signed delivery form\n%%EOF\n");
    const renditionResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, {
      operationId: randomUUID(), userId: user.id, resource: "renditions", resourceId: renditionId, operation: "create", baseVersion: null, dependencies: [],
      payload: { kind: "rendition_documents", id: renditionId, periodId, beneficiarySheetId: eventSheetId, documents: [{ id: randomUUID(), type: "PLANILLA_FIRMADA", originalName: "planilla-jornada-sintetica.pdf", contentType: "application/pdf", contentBase64: signedPdf.toString("base64") }] },
    }));
    assert.equal(renditionResponse.status, 200);
    const linkedRendition = await prisma.rendition.findUnique({ where: { beneficiarySheetId: eventSheetId }, select: { distributionEventId: true, beneficiarySheetId: true } });
    assert.deepEqual(linkedRendition, { distributionEventId: eventId, beneficiarySheetId: eventSheetId });

    const excessiveEventId = randomUUID();
    const excessivePayload = distributionPreparationPayloadSchema.parse({ ...payload, id: excessiveEventId, allocations: [{ familyId: familyIds[0], remittanceId: remittanceIds[0], moduleQuantity: 3 }] });
    const excessiveResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, { ...syncPayload, operationId: randomUUID(), resourceId: excessiveEventId, payload: excessivePayload }));
    assert.equal(excessiveResponse.status, 400);
    assert.match(JSON.stringify(await excessiveResponse.json()), /supera los módulos recibidos/);
    assert.equal(await prisma.distributionEvent.count({ where: { id: excessiveEventId } }), 0);

    await prisma.merchandisePeriod.create({ data: { id: supplyPeriodId, label: `Insumos ${suffix}`, agency: "Desarrollo Social", destination: "MERENDERO", startsAt: new Date("2026-11-01T00:00:00Z"), endsAt: new Date("2026-11-30T00:00:00Z") } });
    await prisma.merchandiseRequest.create({ data: { id: supplyRequestId, periodId: supplyPeriodId, requestNumber: `S-${suffix}`, requestedAt: new Date("2026-11-01T00:00:00Z"), requestedQuantity: 5, createdById: user.id } });
    await prisma.merchandiseRequestItem.create({ data: { id: supplyRequestItemId, requestId: supplyRequestId, productName: "Arroz", presentation: "Bolsa de 5 kg", unit: "kg", requestedQuantity: 5 } });
    await prisma.merchandiseQuota.create({ data: { id: supplyQuotaId, requestId: supplyRequestId, approvedQuantity: 5, approvedAt: new Date("2026-11-01T00:00:00Z"), approvedById: user.id, items: { create: { id: supplyQuotaItemId, requestItemId: supplyRequestItemId, authorizedQuantity: 5 } } } });
    await prisma.merchandiseRemittance.create({ data: { id: supplyRemittanceId, requestId: supplyRequestId, quotaId: supplyQuotaId, remittanceNumber: `RS-${suffix}`, receivedAt: new Date("2026-11-02T00:00:00Z"), receivedQuantity: 0, responsibleName: "Equipo de prueba", createdById: user.id, items: { create: { id: supplyReceiptItemId, quotaItemId: supplyQuotaItemId, receivedQuantity: 3.5 } } } });
    const supplyPayload = distributionPreparationPayloadSchema.parse({ kind: "distribution-preparation", id: supplyEventId, periodId: supplyPeriodId, scheduledAt: "2026-11-06", location: "Merendero", responsibleNames: "Equipo de prueba", allocations: [], supplyAllocations: [{ receiptItemId: supplyReceiptItemId, quantity: 2.25 }] });
    const supplySyncPayload = { ...syncPayload, operationId: randomUUID(), resourceId: supplyEventId, payload: supplyPayload };
    const supplySyncResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, supplySyncPayload));
    assert.equal(supplySyncResponse.status, 200);
    assert.equal(await prisma.distributionSupplyAllocation.count({ where: { eventId: supplyEventId } }), 1);
    const supplyCollectionResponse = await getRecords(createRequest("http://localhost:3000/api/records?includePeriodDetails=true", "GET", token));
    const supplyCollection = recordsCollectionSchema.parse(await supplyCollectionResponse.json());
    assert.equal(supplyCollection.supplyReceipts.find((receipt) => receipt.id === supplyReceiptItemId)?.remainingQuantity, 1.25);
    assert.equal(supplyCollection.distributionEvents.find((entry) => entry.id === supplyEventId)?.supplyAllocations[0]?.unit, "kg");
    const excessiveSupplyPayload = distributionPreparationPayloadSchema.parse({ ...supplyPayload, id: excessiveSupplyId, supplyAllocations: [{ receiptItemId: supplyReceiptItemId, quantity: 2 }] });
    const excessiveSupplyResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, { ...supplySyncPayload, operationId: randomUUID(), resourceId: excessiveSupplyId, payload: excessiveSupplyPayload }));
    assert.equal(excessiveSupplyResponse.status, 400);
    assert.match(JSON.stringify(await excessiveSupplyResponse.json()), /cantidad asignada supera lo recibido disponible/);
  } finally {
    await prisma.renditionDocument.deleteMany({ where: { rendition: { periodId } } });
    await prisma.rendition.deleteMany({ where: { periodId } });
    await prisma.beneficiarySheet.deleteMany({ where: { periodId } });
    await prisma.distributionSupplyAllocation.deleteMany({ where: { eventId: { in: [supplyEventId, excessiveSupplyId] } } });
    await prisma.distributionEvent.deleteMany({ where: { id: { in: [supplyEventId, excessiveSupplyId] } } });
    await prisma.merchandiseReceiptItem.deleteMany({ where: { id: supplyReceiptItemId } });
    await prisma.merchandiseQuotaItem.deleteMany({ where: { id: supplyQuotaItemId } });
    await prisma.merchandiseRemittance.deleteMany({ where: { id: supplyRemittanceId } });
    await prisma.merchandiseQuota.deleteMany({ where: { id: supplyQuotaId } });
    await prisma.merchandiseRequestItem.deleteMany({ where: { id: supplyRequestItemId } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: supplyRequestId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: supplyPeriodId } });
    await prisma.distributionParticipant.deleteMany({ where: { familyDelivery: { event: { periodId } } } });
    await prisma.familyDelivery.deleteMany({ where: { event: { periodId } } });
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
