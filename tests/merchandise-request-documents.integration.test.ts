import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { issueMerchandiseRequestDocument } from "@/server/services/merchandise-request-document.service";

const logoDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGMQ7AgFIgYIBQAZBgO5BdzoXgAAAABJRU5ErkJggg==";

test("request document emissions retain their source snapshot and are idempotent", async () => {
  assert.equal(process.env.ALLOW_SYNC_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(8).toString("hex");
  const user = await prisma.user.create({ data: { email: `request-doc-${suffix}@example.test`, username: `request-doc-${suffix}`, name: "QA Association", role: UserRole.PRESIDENTE } });
  const period = await prisma.merchandisePeriod.create({ data: { label: `QA request document ${suffix}`, agency: "Organismo QA", destination: "MERENDERO", startsAt: new Date("2026-10-01"), endsAt: new Date("2026-10-31") } });
  const request = await prisma.merchandiseRequest.create({ data: { periodId: period.id, requestNumber: `QA-${suffix}`, requestedAt: new Date("2026-10-12"), requestedQuantity: 4.5, createdById: user.id, items: { create: { productName: "Harina de prueba", presentation: "Bolsa de 1 kg", unit: "kg", requestedQuantity: 4.5 } } } });
  const id = randomUUID();
  const payload = { kind: "request-document", id, requestId: request.id, documentKind: "MERENDERO_SUPPLIES", template: { associationName: "Asociación QA editable", resolution: "", address: "", contact: "", recipient: "Organismo QA", recipientTitle: "", locality: "Tucumán", issueDate: "2026-10-31", requestedPeriod: period.label, purpose: "Solicitamos insumos para actividades de prueba.", population: "", observations: "", signatories: [{ name: "Responsable QA", title: "Presidencia" }], logoDataUrl } };

  try {
    const first = await issueMerchandiseRequestDocument(payload, user.id);
    const replay = await issueMerchandiseRequestDocument(payload, user.id);
    const saved = await prisma.merchandiseRequestDocument.findUniqueOrThrow({ where: { id } });
    const snapshot = saved.snapshot as { template: { associationName: string }; request: { requestNumber: string; period: { label: string }; items: Array<{ productName: string; requestedQuantity: number }> } };
    assert.equal(first.version, 1);
    assert.equal(replay.version, 1);
    assert.match(Buffer.from(saved.content).toString("ascii", 0, 8), /^%PDF-/);
    assert.equal(snapshot.template.associationName, "Asociación QA editable");
    assert.equal(snapshot.request.requestNumber, request.requestNumber);
    assert.equal(snapshot.request.period.label, period.label);
    assert.deepEqual(snapshot.request.items[0], { productName: "Harina de prueba", presentation: "Bolsa de 1 kg", unit: "kg", requestedQuantity: 4.5 });
    assert.equal(await prisma.merchandiseRequestDocument.count({ where: { requestId: request.id } }), 1);
  } finally {
    await prisma.merchandiseRequestDocument.deleteMany({ where: { requestId: request.id } });
    await prisma.merchandiseRequestItem.deleteMany({ where: { requestId: request.id } });
    await prisma.merchandiseRequest.delete({ where: { id: request.id } });
    await prisma.merchandisePeriod.delete({ where: { id: period.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
