import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { familyService } from "@/server/services/family.service";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity, type BrowserIdentity } from "./browser-identity";

test("registra un módulo por familia y emite la planilla de la jornada", async ({ context, page }) => {
  const identity: BrowserIdentity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const familyName = `COD1538 Familia sintética ${suffix.slice(0, 8)}`;
  const periodLabel = `COD1538 Jornada sintética ${suffix.slice(0, 8)}`;
  const periodId = randomUUID();
  const requestId = randomUUID();
  const quotaId = randomUUID();
  const remittanceId = randomUUID();
  const eventId = randomUUID();
  let familyId = "";

  try {
    const family = await familyService.create({
      name: familyName,
      neighborhood: "Barrio sintético COD1538",
      address: "Domicilio sintético COD1538",
      contactPhone: "3815551538",
      referenceMemberIndex: 0,
      members: [
        { firstName: "Rita", lastName: "Entrega", dni: "98765381", relationship: "Referente", missingDocuments: [] },
        { firstName: "Tomás", lastName: "Entrega", dni: "98765382", relationship: "Integrante", missingDocuments: [] },
      ],
    }, identity.userId, randomUUID());
    familyId = family.id;

    await prisma.merchandisePeriod.create({ data: { id: periodId, label: periodLabel, agency: "COD1538 QA", startsAt: new Date("2026-11-01T00:00:00.000Z"), endsAt: new Date("2026-11-30T00:00:00.000Z") } });
    await prisma.merchandiseRequest.create({ data: { id: requestId, periodId, requestNumber: `COD1538-${suffix}`, requestedAt: new Date("2026-11-01T00:00:00.000Z"), requestedQuantity: 1, createdById: identity.userId } });
    await prisma.merchandiseQuota.create({ data: { id: quotaId, requestId, approvedQuantity: 1, approvedAt: new Date("2026-11-01T00:00:00.000Z"), approvedById: identity.userId } });
    await prisma.merchandiseRemittance.create({ data: { id: remittanceId, requestId, quotaId, remittanceNumber: `COD1538-R-${suffix}`, receivedAt: new Date("2026-11-01T00:00:00.000Z"), receivedQuantity: 1, responsibleName: "Equipo sintético", createdById: identity.userId } });
    await prisma.distributionEvent.create({ data: { id: eventId, periodId, scheduledAt: new Date("2026-11-10T00:00:00.000Z"), location: "Salón sintético COD1538", responsibleNames: "Equipo de prueba", createdById: identity.userId } });
    await prisma.distributionAllocation.create({ data: { eventId, familyId, remittanceId, moduleQuantity: 1, createdById: identity.userId } });

    await setBrowserIdentity(context, identity);
    await page.goto("/entrega");
    await expect(page.getByRole("heading", { name: "Beneficiarios y planillas" })).toBeVisible();
    await page.locator("#record-period").click();
    await page.getByRole("option", { name: new RegExp(periodLabel) }).click();

    await expect(page.getByText("Retiros por jornada")).toBeVisible();
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.locator("#family-delivery-family").click();
    await page.getByRole("option", { name: new RegExp(familyName) }).click();
    await page.getByRole("checkbox", { name: "Incluir a Rita Entrega en el retiro" }).check();
    await page.getByRole("checkbox", { name: "DNI presentado y cotejado: Rita Entrega" }).check();
    await page.getByRole("checkbox", { name: "Firma manuscrita documentada: Rita Entrega" }).check();
    await context.setOffline(true);
    await page.waitForFunction(() => !navigator.onLine);
    await page.getByRole("button", { name: "Registrar un módulo" }).click();
    await expect(page.getByText("Retiro pendiente. Quedó guardado en este dispositivo y se validará al reconectar.")).toBeVisible();

    await page.getByRole("button", { name: "Emitir planilla de esta jornada" }).click();
    await expect(page.getByText("Planilla local guardada con la referencia de esta jornada. Sigue pendiente de validación del servidor.")).toBeVisible();
    const queuedRecords = await page.evaluate(async (userId) => {
      const request = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 2);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const operations = await new Promise<Array<{ operationId: string; resourceId: string }>>((resolve, reject) => {
        const operationRequest = database.transaction("operations", "readonly").objectStore("operations").getAll();
        operationRequest.onsuccess = () => resolve(operationRequest.result);
        operationRequest.onerror = () => reject(operationRequest.error);
      });
      database.close();
      return operations;
    }, identity.userId);
    expect(queuedRecords).toHaveLength(2);
    const operationIds = queuedRecords.map((operation) => operation.operationId);

    await context.setOffline(false);
    await expect.poll(() => prisma.synchronizationReceipt.count({ where: { operationId: { in: operationIds } } }), { timeout: 30_000 }).toBe(2);
    await expect(page.getByText("1 familia · 1 módulo registrado")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Rita Entrega · DNI cotejado · Firma manuscrita documentada")).toBeVisible();
    const sheet = await prisma.beneficiarySheet.findFirst({ where: { distributionEventId: eventId }, select: { id: true, snapshot: true } });
    expect(sheet).toBeTruthy();
    expect(sheet?.snapshot).toMatchObject({ event: { id: eventId }, beneficiaries: [{ familyDeliveryId: expect.any(String), paperSignatureChecked: true, physicalDniChecked: true }] });

    const sheetResponse = await context.request.get(`/api/records/sheets/${sheet?.id}`);
    expect(sheetResponse.ok()).toBe(true);
    expect(sheetResponse.headers()["content-type"]).toContain("application/pdf");
    expect(sheetResponse.headers()["cache-control"]).toContain("no-store");
    expect((await sheetResponse.body()).subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const storedSheet = await prisma.beneficiarySheet.findUniqueOrThrow({ where: { id: sheet?.id }, select: { storageProvider: true, storageStatus: true, storageBucket: true, storageKey: true, checksum: true } });
    expect(storedSheet).toMatchObject({ storageProvider: "CLOUDFLARE_R2", storageStatus: "CONFIRMED" });
    expect(storedSheet.storageKey).toContain(storedSheet.checksum);
  } finally {
    await context.setOffline(false);
    await prisma.renditionDocument.deleteMany({ where: { rendition: { beneficiarySheet: { distributionEventId: eventId } } } });
    await prisma.rendition.deleteMany({ where: { distributionEventId: eventId } });
    await prisma.beneficiarySheet.deleteMany({ where: { distributionEventId: eventId } });
    await prisma.distributionParticipant.deleteMany({ where: { familyDelivery: { eventId } } });
    await prisma.familyDelivery.deleteMany({ where: { eventId } });
    await prisma.distributionAllocation.deleteMany({ where: { eventId } });
    await prisma.distributionEvent.deleteMany({ where: { id: eventId } });
    await prisma.merchandiseRemittance.deleteMany({ where: { id: remittanceId } });
    await prisma.merchandiseQuota.deleteMany({ where: { id: quotaId } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: requestId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    if (familyId) {
      await prisma.family.deleteMany({ where: { id: familyId } });
      await prisma.person.deleteMany({ where: { memberships: { none: {} }, referencedBy: { none: {} }, firstName: { in: ["Rita", "Tomás"] }, lastName: "Entrega" } });
    }
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
