import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { GET as getPrivateRenditionDocument } from "@/app/api/renditions/documents/[id]/route";
import { PATCH as patchRenditionReview } from "@/app/api/renditions/[id]/review/route";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { prisma } from "@/lib/prisma";
import { RenditionDocumentError, renditionSynchronizationHandler } from "@/server/services/rendition-synchronization.service";
import { synchronizationService } from "@/server/services/synchronization.service";
import type { JsonValue } from "@/types/json-value";

function createOperation(userId: string, resourceId: string, payload: Record<string, JsonValue>): SubmittedSyncOperation {
  return {
    operationId: randomUUID(),
    userId,
    resource: "renditions",
    resourceId,
    operation: "create",
    baseVersion: null,
    dependencies: [],
    payload,
  };
}

function createRequest(url: string, method: "GET" | "PATCH", token: string, body?: unknown) {
  const headers = new Headers({ host: "localhost:3000", cookie: `${AUTH.SESSION_COOKIE}=${token}` });

  if (method === "PATCH") {
    headers.set("origin", "http://localhost:3000");
    headers.set("content-type", "application/json");
  }

  return new NextRequest(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test("rendition PDFs persist as private versioned documents and require authorized manual review", async () => {
  assert.equal(process.env.ALLOW_RENDITION_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(10).toString("hex");
  const user = await prisma.user.create({
    data: { email: `rendition-${suffix}@example.test`, username: `rendition-${suffix}`, name: "Rendition Test Secretary", role: UserRole.SECRETARIA },
  });
  const periodId = randomUUID();
  const sheetId = randomUUID();
  const renditionId = randomUUID();
  const originalDocumentId = randomUUID();
  const originalPdf = Buffer.from("%PDF-1.7\nOriginal signed sheet\n%%EOF\n");
  const uploadOperation = createOperation(user.id, renditionId, {
    kind: "rendition_documents",
    id: renditionId,
    periodId,
    beneficiarySheetId: sheetId,
    documents: [{
      id: originalDocumentId,
      type: "PLANILLA_FIRMADA",
      originalName: "planilla-firmada.pdf",
      contentType: "application/pdf",
      contentBase64: originalPdf.toString("base64"),
    }],
  });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  let unauthorizedUserId = "";
  let replacementDocumentId = "";

  try {
    await prisma.merchandisePeriod.create({
      data: { id: periodId, label: `Rendition October ${suffix}`, agency: "Development Social Ministry", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-31") },
    });
    await prisma.beneficiarySheet.create({
      data: {
        id: sheetId,
        periodId,
        version: 1,
        snapshot: { period: { label: "October", agency: "Development Social Ministry", startsAt: "2026-10-01", endsAt: "2026-10-31" }, version: 1, createdAt: new Date().toISOString(), beneficiaries: [{ personId: randomUUID(), name: "Test Person", dni: "12345678", familyName: "Test Family", address: "Test Street" }] },
        createdById: user.id,
      },
    });
    await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });

    const firstResponse = await synchronizationService.apply(uploadOperation, "RENDITIONS", renditionSynchronizationHandler);
    const replayResponse = await synchronizationService.apply(uploadOperation, "RENDITIONS", renditionSynchronizationHandler);
    const savedRendition = await prisma.rendition.findUnique({ where: { beneficiarySheetId: sheetId }, include: { documents: true } });

    assert.equal(firstResponse.replayed, false);
    assert.equal(replayResponse.replayed, true);
    assert.equal(savedRendition?.periodId, periodId);
    assert.equal(savedRendition?.beneficiarySheetId, sheetId);
    assert.equal(savedRendition?.documents.length, 1);
    assert.equal(Buffer.from(savedRendition?.documents[0]?.content ?? new Uint8Array()).toString(), originalPdf.toString());

    const replacementPdf = Buffer.from("%PDF-1.7\nCorrected signed sheet\n%%EOF\n");
    replacementDocumentId = randomUUID();
    const replacementOperationId = randomUUID();
    const replacementOperation = createOperation(user.id, replacementOperationId, {
      kind: "rendition_documents",
      id: replacementOperationId,
      periodId,
      beneficiarySheetId: sheetId,
      documents: [{
        id: replacementDocumentId,
        type: "PLANILLA_FIRMADA",
        supersedesId: originalDocumentId,
        originalName: "planilla-firmada-corregida.pdf",
        contentType: "application/pdf",
        contentBase64: replacementPdf.toString("base64"),
      }],
    });
    await synchronizationService.apply(replacementOperation, "RENDITIONS", renditionSynchronizationHandler);
    const versionedDocuments = await prisma.renditionDocument.findMany({ where: { renditionId: savedRendition?.id }, orderBy: { version: "asc" } });

    assert.equal(versionedDocuments.length, 2);
    assert.equal(versionedDocuments[0]?.version, 1);
    assert.equal(versionedDocuments[1]?.version, 2);
    assert.equal(versionedDocuments[1]?.supersedesId, originalDocumentId);
    assert.equal(await prisma.rendition.count({ where: { id: savedRendition?.id, reviewStatus: "PENDIENTE" } }), 1);

    const downloadResponse = await getPrivateRenditionDocument(
      createRequest(`http://localhost:3000/api/renditions/documents/${replacementDocumentId}?inline=1`, "GET", token),
      { params: Promise.resolve({ id: replacementDocumentId }) },
    );
    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadResponse.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.match(downloadResponse.headers.get("content-disposition") ?? "", /^inline;/);
    assert.equal(await downloadResponse.text(), replacementPdf.toString());

    const reviewResponse = await patchRenditionReview(
      createRequest(`http://localhost:3000/api/renditions/${savedRendition?.id}/review`, "PATCH", token, { status: "REVISADA" }),
      { params: Promise.resolve({ id: savedRendition?.id ?? "" }) },
    );
    assert.equal(reviewResponse.status, 200);
    assert.equal(await prisma.rendition.count({ where: { id: savedRendition?.id, reviewStatus: "REVISADA", reviewedById: user.id } }), 1);

    const invalidOperationId = randomUUID();
    const invalidOperation = createOperation(user.id, invalidOperationId, {
      kind: "rendition_documents",
      id: invalidOperationId,
      periodId,
      beneficiarySheetId: sheetId,
      documents: [{ id: randomUUID(), type: "RESPALDO", originalName: "fake.pdf", contentType: "application/pdf", contentBase64: Buffer.from("not a PDF").toString("base64") }],
    });
    await assert.rejects(
      synchronizationService.apply(invalidOperation, "RENDITIONS", renditionSynchronizationHandler),
      RenditionDocumentError,
    );

    const unauthorizedUser = await prisma.user.create({
      data: { email: `rendition-reader-${suffix}@example.test`, name: "Unprivileged Test User", role: UserRole.TESORERIA },
    });
    unauthorizedUserId = unauthorizedUser.id;
    const unauthorizedToken = randomBytes(32).toString("hex");
    const unauthorizedHash = createHash("sha256").update(unauthorizedToken).digest("hex");
    await prisma.authSession.create({ data: { userId: unauthorizedUser.id, tokenHash: unauthorizedHash, expiresAt: new Date(Date.now() + 60_000) } });
    const deniedResponse = await getPrivateRenditionDocument(
      createRequest(`http://localhost:3000/api/renditions/documents/${replacementDocumentId}`, "GET", unauthorizedToken),
      { params: Promise.resolve({ id: replacementDocumentId }) },
    );
    assert.equal(deniedResponse.status, 403);
  } finally {
    if (unauthorizedUserId) {
      await prisma.user.deleteMany({ where: { id: unauthorizedUserId } });
    }
    await prisma.renditionDocument.deleteMany({ where: { OR: [{ id: originalDocumentId }, { id: replacementDocumentId }, { uploadedById: user.id }] } });
    await prisma.rendition.deleteMany({ where: { OR: [{ beneficiarySheetId: sheetId }, { createdById: user.id }] } });
    await prisma.beneficiarySheet.deleteMany({ where: { id: sheetId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
