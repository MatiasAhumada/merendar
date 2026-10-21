import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { createBeneficiarySheetPdf } from "@/server/services/beneficiary-sheet.service";
import { NextRequest } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { GET as getRecords } from "@/app/api/records/route";
import { POST as issueSheet } from "@/app/api/records/sheets/route";
import { GET as downloadSheet } from "@/app/api/records/sheets/[id]/route";
import { POST as postSynchronization } from "@/app/api/synchronizations/route";
import { prisma } from "@/lib/prisma";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { synchronizationService } from "@/server/services/synchronization.service";
import { recordSynchronizationHandler } from "@/server/services/record-synchronization.service";

function createRequest(url: string, method: string, token: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
      cookie: `${AUTH.SESSION_COOKIE}=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("beneficiary records synchronize once and issued sheets retain a printable snapshot", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(8).toString("hex");
  const user = await prisma.user.create({
    data: { email: `records-${suffix}@example.test`, username: `records-${suffix}`, name: "Records Test Secretary", role: UserRole.SECRETARIA },
  });
  const periodId = randomUUID();
  const familyId = randomUUID();
  const personId = randomUUID();
  const recordId = randomUUID();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const operationId = randomUUID();
  const operation: SubmittedSyncOperation = {
    operationId,
    userId: user.id,
    resource: "records",
    resourceId: recordId,
    operation: "create",
    baseVersion: null,
    dependencies: [],
    payload: {
      kind: "distribution-record",
      id: recordId,
      periodId,
      familyId,
      personId,
      receivedAt: "2026-10-20",
      moduleType: "Módulo familiar seco",
      quantity: 1,
      physicalDniChecked: true,
      documentsChecked: false,
      notes: "Retira en el merendero",
    },
  };
  let sheetId = "";
  let unauthorizedUserId = "";

  try {
    await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.merchandisePeriod.create({
      data: { id: periodId, label: `Octubre ${suffix}`, agency: "Desarrollo Social", startsAt: new Date("2026-10-01T00:00:00.000Z"), endsAt: new Date("2026-10-31T00:00:00.000Z") },
    });
    await prisma.person.create({ data: { id: personId, firstName: "José", lastName: "Pérez", dni: `${suffix.slice(0, 8)}` } });
    await prisma.family.create({
      data: {
        id: familyId,
        name: "Familia Pérez",
        neighborhood: "Villa Nueva",
        address: "Pasaje de la Constitución 123",
        referencePersonId: personId,
        createdById: user.id,
        members: { create: [{ personId, relationship: "Titular" }] },
      },
    });

    const firstResult = await synchronizationService.apply(operation, "RECORDS", recordSynchronizationHandler);
    const replayedResult = await synchronizationService.apply(operation, "RECORDS", recordSynchronizationHandler);
    assert.equal(firstResult.replayed, false);
    assert.equal(replayedResult.replayed, true);
    assert.equal(await prisma.distributionRecord.count({ where: { periodId } }), 1);

    const duplicateRecordId = randomUUID();
    const duplicateOperation: SubmittedSyncOperation = {
      ...operation,
      operationId: randomUUID(),
      resourceId: duplicateRecordId,
      payload: { ...operation.payload as Record<string, string | number | boolean>, id: duplicateRecordId },
    };
    await assert.rejects(synchronizationService.apply(duplicateOperation, "RECORDS", recordSynchronizationHandler));
    assert.equal(await prisma.distributionRecord.count({ where: { periodId } }), 1);

    const syncResponse = await postSynchronization(createRequest("http://localhost:3000/api/synchronizations", "POST", token, {
      ...operation,
      operationId: randomUUID(),
    }));
    assert.equal(syncResponse.status, 409);

    const readResponse = await getRecords(createRequest(`http://localhost:3000/api/records?periodId=${periodId}`, "GET", token));
    const readResult = await readResponse.json() as { records: Array<{ personId: string; family: { name: string } }> };
    assert.equal(readResponse.status, 200);
    assert.equal(readResult.records[0]?.personId, personId);
    assert.equal(readResult.records[0]?.family.name, "Familia Pérez");

    const issueResponse = await issueSheet(createRequest("http://localhost:3000/api/records/sheets", "POST", token, { periodId, personIds: [personId] }));
    assert.equal(issueResponse.status, 201);
    const issueResult = await issueResponse.json() as { sheet: { id: string; version: number } };
    sheetId = issueResult.sheet.id;
    assert.equal(issueResult.sheet.version, 1);

    const downloadResponse = await downloadSheet(
      createRequest(`http://localhost:3000/api/records/sheets/${sheetId}`, "GET", token),
      { params: Promise.resolve({ id: sheetId }) },
    );
    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadResponse.headers.get("content-type"), "application/pdf");
    assert.equal(downloadResponse.headers.get("cache-control"), "private, no-store, max-age=0");
    const pdf = await PDFDocument.load(await downloadResponse.arrayBuffer());
    assert.equal(pdf.getPageCount(), 1);

    const secondIssue = await issueSheet(createRequest("http://localhost:3000/api/records/sheets", "POST", token, { periodId, personIds: [personId] }));
    const secondResult = await secondIssue.json() as { sheet: { id: string; version: number } };
    assert.equal(secondResult.sheet.version, 2);
    assert.notEqual(secondResult.sheet.id, sheetId);
    const preservedSheets = await prisma.beneficiarySheet.findMany({ where: { periodId }, orderBy: { version: "asc" } });
    assert.deepEqual(preservedSheets.map((savedSheet) => savedSheet.version), [1, 2]);
    const firstSnapshotSchema = z.object({ beneficiaries: z.array(z.object({ name: z.string() })) });
    const firstSnapshot = firstSnapshotSchema.safeParse(preservedSheets[0]?.snapshot);
    assert.equal(firstSnapshot.success, true);

    if (!firstSnapshot.success) {
      assert.fail("La primera versión perdió la instantánea de beneficiarios");
    }

    assert.equal(firstSnapshot.data.beneficiaries[0]?.name, "José Pérez");

    const paginatedBytes = await createBeneficiarySheetPdf({
      period: { label: "Módulo de prueba", agency: "Desarrollo Social", startsAt: "2026-10-01", endsAt: "2026-10-31" },
      version: 3,
      createdAt: new Date().toISOString(),
      beneficiaries: Array.from({ length: 30 }, (_, index) => ({
        personId: `person-${index}`,
        name: `María José Beneficiaria ${index}`,
        dni: `${index}`.padStart(8, "0"),
        familyName: `Grupo Comunitario ${index}`,
        address: "Pasaje de la Constitución y barrio de la Solidaridad 123",
      })),
    });
    const paginatedDocument = await PDFDocument.load(paginatedBytes);
    assert.ok(paginatedDocument.getPageCount() > 1);

    const unauthorizedUser = await prisma.user.create({
      data: { email: `records-reader-${suffix}@example.test`, name: "Records Test Reader", role: UserRole.TESORERIA },
    });
    unauthorizedUserId = unauthorizedUser.id;
    const unauthorizedToken = randomBytes(32).toString("hex");
    const unauthorizedTokenHash = createHash("sha256").update(unauthorizedToken).digest("hex");
    await prisma.authSession.create({ data: { userId: unauthorizedUser.id, tokenHash: unauthorizedTokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    const forbiddenIssue = await issueSheet(createRequest("http://localhost:3000/api/records/sheets", "POST", unauthorizedToken, { periodId, personIds: [personId] }));
    assert.equal(forbiddenIssue.status, 403);
    const forbiddenRead = await getRecords(createRequest(`http://localhost:3000/api/records?periodId=${periodId}`, "GET", unauthorizedToken));
    assert.equal(forbiddenRead.status, 403);
    const forbiddenDownload = await downloadSheet(
      createRequest(`http://localhost:3000/api/records/sheets/${sheetId}`, "GET", unauthorizedToken),
      { params: Promise.resolve({ id: sheetId }) },
    );
    assert.equal(forbiddenDownload.status, 403);
  } finally {
    await prisma.beneficiarySheet.deleteMany({ where: { periodId } });
    await prisma.distributionRecord.deleteMany({ where: { periodId } });
    await prisma.familyMember.deleteMany({ where: { familyId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.user.deleteMany({ where: { id: unauthorizedUserId } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
