import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { GET as getPrivateRenditionDocument } from "@/app/api/renditions/documents/[id]/route";
import { PATCH as patchRenditionReview } from "@/app/api/renditions/[id]/review/route";
import { POST as createRenditionEmissionRoute } from "@/app/api/renditions/[id]/emissions/route";
import { POST as createRenditionSubmissionRoute } from "@/app/api/renditions/[id]/submissions/route";
import { GET as getRenditionEmissionFile } from "@/app/api/renditions/emissions/[id]/route";
import { renditionEmissionPayloadSchema } from "@/schemas/rendition.schema";
import { POST as synchronizeOfflineOperation } from "@/app/api/synchronizations/route";
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

function createRequest(url: string, method: "GET" | "PATCH" | "POST", token: string, body?: unknown) {
  const headers = new Headers({ host: "localhost:3000", cookie: `${AUTH.SESSION_COOKIE}=${token}` });

  if (method !== "GET") {
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
  const signedSheetPdf = await PDFDocument.create();
  signedSheetPdf.addPage();
  const originalPdf = Buffer.from(await signedSheetPdf.save());
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

    const emissionInput = renditionEmissionPayloadSchema.parse({
      renditionId: savedRendition?.id,
      template: {
        issueDate: "2026-10-30",
        locality: "Development locality",
        recipient: "Development agency",
        recipientTitle: "Document recipient",
        associationName: "Synthetic association",
        associationResolution: "Test resolution",
        associationAddress: "Synthetic address",
        associationPhone: "",
        associationEmail: "",
        observations: "",
        signatories: [{ name: "Synthetic signatory", title: "Secretary" }],
      },
    });
    const emissionResponse = await createRenditionEmissionRoute(
      createRequest(`http://localhost:3000/api/renditions/${savedRendition?.id}/emissions`, "POST", token, emissionInput),
      { params: Promise.resolve({ id: savedRendition?.id ?? "" }) },
    );
    assert.equal(emissionResponse.status, 201);
    const emissionResponseValue: unknown = await emissionResponse.json();
    const parsedEmissionResponse = z.object({ emission: z.object({ id: z.string(), version: z.number() }) }).parse(emissionResponseValue);
    const emissionId = parsedEmissionResponse.emission.id;
    assert.equal(parsedEmissionResponse.emission.version, 1);

    for (const kind of ["note", "summary", "package"] as const) {
      const emissionFileResponse = await getRenditionEmissionFile(
        createRequest(`http://localhost:3000/api/renditions/emissions/${emissionId}?kind=${kind}`, "GET", token),
        { params: Promise.resolve({ id: emissionId }) },
      );
      assert.equal(emissionFileResponse.status, 200);
      assert.equal(emissionFileResponse.headers.get("cache-control"), "private, no-store, max-age=0");
      const pdfBytes = new Uint8Array(await emissionFileResponse.arrayBuffer());
      let expectedPageCount = 1;
      if (kind === "package") {
        expectedPageCount = 3;
      }
      assert.equal((await PDFDocument.load(pdfBytes)).getPageCount(), expectedPageCount);
    }

    const offlineEmissionId = randomUUID();
    const offlineEmissionOperation = createOperation(user.id, offlineEmissionId, {
      kind: "rendition_emission",
      id: offlineEmissionId,
      renditionId: savedRendition?.id ?? "",
      periodId,
      beneficiarySheetId: sheetId,
      sourceDocumentIds: [originalDocumentId],
      template: emissionInput.template,
    });
    const offlineEmissionResponse = await synchronizeOfflineOperation(
      createRequest("http://localhost:3000/api/synchronizations", "POST", token, offlineEmissionOperation),
    );
    const replayedOfflineEmissionResponse = await synchronizeOfflineOperation(
      createRequest("http://localhost:3000/api/synchronizations", "POST", token, offlineEmissionOperation),
    );
    assert.equal(offlineEmissionResponse.status, 200);
    assert.equal(replayedOfflineEmissionResponse.status, 200);
    const replayedOfflineEmission: unknown = await replayedOfflineEmissionResponse.json();
    assert.equal(z.object({ replayed: z.boolean() }).parse(replayedOfflineEmission).replayed, true);
    assert.equal(await prisma.renditionEmission.count({ where: { id: offlineEmissionId, renditionId: savedRendition?.id, version: 2 } }), 1);
    const offlineEmissionPdf = await prisma.renditionEmission.findUnique({ where: { id: offlineEmissionId }, select: { packagePdf: true, snapshot: true } });
    assert.equal((await PDFDocument.load(offlineEmissionPdf?.packagePdf ?? new Uint8Array())).getPageCount(), 3);
    assert.equal(z.object({ sheet: z.object({ id: z.string() }) }).parse(offlineEmissionPdf?.snapshot).sheet.id, sheetId);

    const submissionResponse = await createRenditionSubmissionRoute(
      createRequest(`http://localhost:3000/api/renditions/${savedRendition?.id}/submissions`, "POST", token, {
        submittedAt: "2026-10-30",
        recipient: "Development agency registry",
        externalReference: "TEST-REFERENCE-01",
      }),
      { params: Promise.resolve({ id: savedRendition?.id ?? "" }) },
    );
    assert.equal(submissionResponse.status, 201);
    assert.equal(await prisma.renditionSubmission.count({ where: { renditionId: savedRendition?.id, recipient: "Development agency registry", recordedById: user.id } }), 1);

    const queuedSubmission = createOperation(user.id, savedRendition?.id ?? "", {
      kind: "rendition_submission",
      id: savedRendition?.id ?? "",
      renditionId: savedRendition?.id ?? "",
      emissionId,
      submittedAt: "2026-10-29",
      recipient: "Development registry desk",
      externalReference: "TEST-REFERENCE-02",
    });
    const queuedSubmissionResponse = await synchronizeOfflineOperation(
      createRequest("http://localhost:3000/api/synchronizations", "POST", token, queuedSubmission),
    );
    const replayedSubmissionResponse = await synchronizeOfflineOperation(
      createRequest("http://localhost:3000/api/synchronizations", "POST", token, queuedSubmission),
    );
    assert.equal(queuedSubmissionResponse.status, 200);
    assert.equal(replayedSubmissionResponse.status, 200);
    const replayedSubmission: unknown = await replayedSubmissionResponse.json();
    assert.equal(z.object({ replayed: z.boolean() }).parse(replayedSubmission).replayed, true);
    assert.equal(await prisma.renditionSubmission.count({ where: { renditionId: savedRendition?.id, recipient: "Development registry desk", recordedById: user.id } }), 1);

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

    const queuedReviewOperationId = randomUUID();
    const queuedReview = {
      operationId: queuedReviewOperationId,
      userId: user.id,
      resource: "renditions",
      resourceId: savedRendition?.id,
      operation: "create",
      baseVersion: null,
      dependencies: [],
      payload: { kind: "rendition_review", id: savedRendition?.id, status: "OBSERVADA", notes: "Falta corregir el escaneo." },
    };
    const queuedReviewResponse = await synchronizeOfflineOperation(
      createRequest("http://localhost:3000/api/synchronizations", "POST", token, queuedReview),
    );
    const replayedReviewResponse = await synchronizeOfflineOperation(
      createRequest("http://localhost:3000/api/synchronizations", "POST", token, queuedReview),
    );
    assert.equal(queuedReviewResponse.status, 200);
    assert.equal(replayedReviewResponse.status, 200);
    assert.equal((await replayedReviewResponse.json()).replayed, true);
    assert.equal(await prisma.rendition.count({ where: { id: savedRendition?.id, reviewStatus: "OBSERVADA", reviewNotes: "Falta corregir el escaneo.", reviewedById: user.id } }), 1);

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
    await prisma.renditionSubmission.deleteMany({ where: { renditionId } });
    await prisma.renditionEmission.deleteMany({ where: { renditionId } });
    await prisma.renditionDocument.deleteMany({ where: { OR: [{ id: originalDocumentId }, { id: replacementDocumentId }, { uploadedById: user.id }] } });
    await prisma.rendition.deleteMany({ where: { OR: [{ beneficiarySheetId: sheetId }, { createdById: user.id }] } });
    await prisma.beneficiarySheet.deleteMany({ where: { id: sheetId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
