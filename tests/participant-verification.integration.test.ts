import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { PATCH as updateParticipantRoute } from "@/app/api/records/distribution-participants/[id]/route";
import { PATCH as reviewRenditionRoute } from "@/app/api/renditions/[id]/review/route";
import { prisma } from "@/lib/prisma";
import { createRenditionEmission, createRenditionSubmission } from "@/server/services/rendition.service";
import { renditionSynchronizationHandler } from "@/server/services/rendition-synchronization.service";
import { renditionEmissionPayloadSchema, renditionEmissionOperationPayloadSchema, renditionSubmissionPayloadSchema } from "@/schemas/rendition.schema";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { ApiError } from "@/utils/handlers/apiError.handler";

function createRequest(url: string, method: "PATCH", token: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { host: "localhost:3022", origin: "http://localhost:3022", "content-type": "application/json", cookie: `${AUTH.SESSION_COOKIE}=${token}` },
    body: JSON.stringify(body),
  });
}

function createEmissionTemplate() {
  return renditionEmissionPayloadSchema.parse({
    renditionId: "rendition-placeholder",
    template: {
      issueDate: "2026-11-17",
      locality: "San Miguel de Tucumán",
      recipient: "Organismo de prueba",
      recipientTitle: "Mesa de entrada",
      associationName: "Asociación de prueba",
      associationResolution: "Resolución de prueba",
      associationAddress: "Domicilio de prueba",
      associationPhone: "3815550101",
      associationEmail: "prueba@example.test",
      observations: "",
      signatories: [{ name: "Responsable de prueba", title: "Secretaría" }],
    },
  }).template;
}

function createEmissionOperation(userId: string, periodId: string, sheetId: string, renditionId: string): SubmittedSyncOperation {
  const payload = renditionEmissionOperationPayloadSchema.parse({
    kind: "rendition_emission",
    id: randomUUID(),
    renditionId,
    periodId,
    beneficiarySheetId: sheetId,
    sourceDocumentIds: [],
    template: createEmissionTemplate(),
  });
  return { operationId: randomUUID(), userId, resource: "renditions", resourceId: payload.id, operation: "create", baseVersion: null, dependencies: [], payload };
}

test("participant checks gate rendition emission, review and submission and are revalidated offline", async () => {
  assert.equal(process.env.ALLOW_PARTICIPANT_VERIFICATION_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(8).toString("hex");
  const user = await prisma.user.create({ data: { email: `participant-check-${suffix}@example.test`, username: `participant-check-${suffix}`, name: "Participant Check Secretary", role: UserRole.SECRETARIA } });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const periodId = randomUUID();
  const familyId = randomUUID();
  const personId = randomUUID();
  const memberId = randomUUID();
  const eventId = randomUUID();
  const deliveryId = randomUUID();
  const participantId = randomUUID();
  const sheetId = randomUUID();
  const renditionId = randomUUID();
  const signedDocumentId = randomUUID();
  let emissionOperation: SubmittedSyncOperation | undefined;

  try {
    await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 300_000) } });
    await prisma.merchandisePeriod.create({ data: { id: periodId, label: `Participant checks ${suffix}`, agency: "Development agency", startsAt: new Date("2026-11-01"), endsAt: new Date("2026-11-30") } });
    await prisma.family.create({ data: { id: familyId, name: `Family ${suffix}`, neighborhood: "Development neighborhood", address: "Development address", createdById: user.id } });
    await prisma.person.create({ data: { id: personId, firstName: "Rita", lastName: "Prueba", dni: `7${suffix.slice(0, 7)}` } });
    await prisma.familyMember.create({ data: { id: memberId, familyId, personId, relationship: "Integrante" } });
    await prisma.distributionEvent.create({ data: { id: eventId, periodId, scheduledAt: new Date("2026-11-10"), location: "Salón de prueba", responsibleNames: "Equipo de prueba", createdById: user.id } });
    await prisma.familyDelivery.create({ data: { id: deliveryId, eventId, familyId, recordedById: user.id, participants: { create: { id: participantId, familyMemberId: memberId, paperSignatureChecked: false, physicalDniChecked: false, recordedById: user.id } } } });
    await prisma.beneficiarySheet.create({ data: { id: sheetId, periodId, distributionEventId: eventId, version: 1, snapshot: { period: { label: "Test", agency: "Development agency", startsAt: "2026-11-01", endsAt: "2026-11-30" }, version: 1, createdAt: new Date().toISOString(), beneficiaries: [{ personId, familyMemberId: memberId, familyDeliveryId: deliveryId, name: "Rita Prueba", dni: `7${suffix.slice(0, 7)}`, familyName: "Development family", address: "Development address", paperSignatureChecked: false, physicalDniChecked: false }] }, createdById: user.id } });
    await prisma.rendition.create({ data: { id: renditionId, periodId, distributionEventId: eventId, beneficiarySheetId: sheetId, createdById: user.id } });

    await assert.rejects(
      () => createRenditionEmission({ renditionId, userId: user.id, template: createEmissionTemplate() }),
      (error: unknown) => error instanceof ApiError && error.status === 409 && error.message.includes("Rita Prueba") && error.message.includes("DNI físico pendiente de cotejo"),
    );

    const submissionPayload = renditionSubmissionPayloadSchema.parse({ submittedAt: "2026-11-17", recipient: "Development agency", externalReference: "", notes: "" });
    await assert.rejects(
      () => createRenditionSubmission({ renditionId, userId: user.id, payload: submissionPayload }),
      (error: unknown) => error instanceof ApiError && error.status === 409 && error.message.includes("firma manuscrita pendiente de cotejo"),
    );

    await prisma.distributionParticipant.update({ where: { id: participantId }, data: { paperSignatureChecked: true, physicalDniChecked: true } });
    const reviewWithoutSignedSheet = await reviewRenditionRoute(createRequest(`http://localhost:3022/api/renditions/${renditionId}/review`, "PATCH", token, { status: "REVISADA" }), { params: Promise.resolve({ id: renditionId }) });
    assert.equal(reviewWithoutSignedSheet.status, 409);
    assert.match((await reviewWithoutSignedSheet.json() as { error: { message: string } }).error.message, /planilla firmada vigente/i);
    await prisma.distributionParticipant.update({ where: { id: participantId }, data: { paperSignatureChecked: false, physicalDniChecked: false } });
    await prisma.renditionDocument.create({ data: { id: signedDocumentId, operationId: randomUUID(), renditionId, documentType: "PLANILLA_FIRMADA", version: 1, originalName: "planilla-firmada.pdf", contentType: "application/pdf", byteSize: 12, storageBucket: "development-test", storageKey: "participant-verification/test.pdf", checksum: "test-checksum", uploadedById: user.id } });
    const pendingReview = await reviewRenditionRoute(createRequest(`http://localhost:3022/api/renditions/${renditionId}/review`, "PATCH", token, { status: "REVISADA" }), { params: Promise.resolve({ id: renditionId }) });
    const pendingReviewBody = await pendingReview.json() as { error: { message: string } };
    assert.equal(pendingReview.status, 409);
    assert.match(pendingReviewBody.error.message, /Rita Prueba.*firma manuscrita pendiente de cotejo/);

    const updatedParticipant = await updateParticipantRoute(createRequest(`http://localhost:3022/api/records/distribution-participants/${participantId}`, "PATCH", token, { paperSignatureChecked: true, physicalDniChecked: true }), { params: Promise.resolve({ id: participantId }) });
    assert.equal(updatedParticipant.status, 200);
    assert.deepEqual((await updatedParticipant.json() as { participant: { paperSignatureChecked: boolean; physicalDniChecked: boolean } }).participant, { id: participantId, paperSignatureChecked: true, physicalDniChecked: true });

    const successfulReview = await reviewRenditionRoute(createRequest(`http://localhost:3022/api/renditions/${renditionId}/review`, "PATCH", token, { status: "REVISADA" }), { params: Promise.resolve({ id: renditionId }) });
    assert.equal(successfulReview.status, 200);
    await prisma.renditionDocument.delete({ where: { id: signedDocumentId } });

    emissionOperation = createEmissionOperation(user.id, periodId, sheetId, renditionId);
    const prepareRenditionEmission = renditionSynchronizationHandler.prepare;
    if (!prepareRenditionEmission) {
      throw new Error("The rendition handler must prepare offline emissions.");
    }
    await prisma.distributionParticipant.update({ where: { id: participantId }, data: { paperSignatureChecked: false } });
    await assert.rejects(
      () => prepareRenditionEmission(emissionOperation),
      /firma manuscrita pendiente de cotejo/,
    );
    const preparedOperation: SubmittedSyncOperation = {
      ...emissionOperation,
      preparedEmission: {
        snapshot: {} as NonNullable<SubmittedSyncOperation["preparedEmission"]>["snapshot"],
        notePdf: new Uint8Array(),
        summaryPdf: new Uint8Array(),
        packagePdf: new Uint8Array(),
        storedFiles: {
          note: { bucket: "development-test", objectKey: "unused", checksum: "unused", byteSize: 0, contentType: "application/pdf" },
          summary: { bucket: "development-test", objectKey: "unused", checksum: "unused", byteSize: 0, contentType: "application/pdf" },
          packageFile: { bucket: "development-test", objectKey: "unused", checksum: "unused", byteSize: 0, contentType: "application/pdf" },
        },
        sourceFingerprint: "unused",
      },
    };
    await assert.rejects(
      () => prisma.$transaction((transaction) => renditionSynchronizationHandler.apply(transaction, preparedOperation)),
      /firma manuscrita pendiente de cotejo/,
    );
  } finally {
    await prisma.renditionSubmission.deleteMany({ where: { renditionId } });
    await prisma.renditionEmission.deleteMany({ where: { renditionId } });
    await prisma.renditionDocument.deleteMany({ where: { renditionId } });
    await prisma.rendition.deleteMany({ where: { id: renditionId } });
    await prisma.beneficiarySheet.deleteMany({ where: { id: sheetId } });
    await prisma.distributionParticipant.deleteMany({ where: { id: participantId } });
    await prisma.familyDelivery.deleteMany({ where: { id: deliveryId } });
    await prisma.distributionEvent.deleteMany({ where: { id: eventId } });
    await prisma.familyMember.deleteMany({ where: { id: memberId } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
