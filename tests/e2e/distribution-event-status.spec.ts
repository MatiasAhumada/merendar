import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { familyService } from "@/server/services/family.service";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity, type BrowserIdentity } from "./browser-identity";

const baseOrigin = new URL(process.env.BASE_URL ?? "http://127.0.0.1:3022").origin;

test("cierra y reabre una jornada, conserva su consulta y rechaza retiros tardíos sin duplicarlos", async ({ context, page }) => {
  const identity: BrowserIdentity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const periodId = randomUUID();
  const requestId = randomUUID();
  const quotaId = randomUUID();
  const remittanceId = randomUUID();
  const eventId = randomUUID();
  const eventLabel = `COD1601 Jornada ${suffix.slice(0, 8)}`;
  let familyId = "";
  let familyMemberId = "";
  let secondFamilyId = "";
  let familyDeliveryId = "";

  try {
    const family = await familyService.create({
      name: `${eventLabel} familia`,
      neighborhood: "Barrio sintético COD1601",
      address: "Domicilio sintético COD1601",
      contactPhone: "3815551601",
      referenceMemberIndex: 0,
      members: [{ firstName: "Sofía", lastName: "Prueba", dni: "98765160", relationship: "Referente", missingDocuments: [] }],
    }, identity.userId, randomUUID());
    familyId = family.id;
    familyMemberId = family.members[0]?.membershipId ?? "";
    const secondFamily = await familyService.create({
      name: `${eventLabel} familia 2`,
      neighborhood: "Barrio sintético COD1601",
      address: "Otro domicilio sintético COD1601",
      contactPhone: "3815551602",
      referenceMemberIndex: 0,
      members: [{ firstName: "Renata", lastName: "Prueba", dni: "98765161", relationship: "Referente", missingDocuments: [] }],
    }, identity.userId, randomUUID());
    secondFamilyId = secondFamily.id;

    await prisma.merchandisePeriod.create({ data: { id: periodId, label: eventLabel, agency: "COD1601 QA", startsAt: new Date("2030-11-01T00:00:00.000Z"), endsAt: new Date("2030-11-30T00:00:00.000Z") } });
    await prisma.merchandiseRequest.create({ data: { id: requestId, periodId, requestNumber: `COD1601-${suffix}`, requestedAt: new Date("2030-11-01T00:00:00.000Z"), requestedQuantity: 2, createdById: identity.userId } });
    await prisma.merchandiseQuota.create({ data: { id: quotaId, requestId, approvedQuantity: 2, approvedAt: new Date("2030-11-01T00:00:00.000Z"), approvedById: identity.userId } });
    await prisma.merchandiseRemittance.create({ data: { id: remittanceId, requestId, quotaId, remittanceNumber: `COD1601-R-${suffix}`, receivedAt: new Date("2030-11-01T00:00:00.000Z"), receivedQuantity: 2, responsibleName: "Equipo sintético", createdById: identity.userId } });
    await prisma.distributionEvent.create({ data: { id: eventId, periodId, scheduledAt: new Date("2030-11-10T00:00:00.000Z"), location: "Salón sintético COD1601", responsibleNames: "Equipo de prueba", createdById: identity.userId } });
    await prisma.distributionAllocation.create({ data: { eventId, familyId, remittanceId, moduleQuantity: 1, createdById: identity.userId } });
    const familyDelivery = await prisma.familyDelivery.create({
      data: {
        eventId,
        familyId,
        recordedById: identity.userId,
        participants: { create: [{ familyMemberId, recordedById: identity.userId, paperSignatureChecked: true, physicalDniChecked: true }] },
      },
    });
    familyDeliveryId = familyDelivery.id;
    await prisma.distributionAllocation.create({ data: { eventId, familyId: secondFamilyId, remittanceId, moduleQuantity: 1, createdById: identity.userId } });

    await setBrowserIdentity(context, identity);
    await page.goto("/entrega");
    await page.locator("#record-period").click();
    await page.getByRole("option", { name: new RegExp(eventLabel) }).click();
    await expect(page.getByText("Sofía Prueba · DNI cotejado · Firma manuscrita documentada")).toBeVisible();

    await page.getByRole("button", { name: "Cerrar jornada" }).click();
    await expect(page.getByRole("dialog")).toContainText("No se podrán registrar nuevos retiros");
    await page.getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(page.getByText("La jornada quedó cerrada.")).toBeVisible();
    await expect(page.getByText("La jornada está cerrada.")).toBeVisible();
    await page.getByRole("button", { name: "Reabrir jornada" }).click();
    await page.getByRole("button", { name: "Confirmar reapertura" }).click();
    await expect(page.getByText("La jornada volvió a estar abierta.")).toBeVisible();

    await page.locator("#family-delivery-family").click();
    await page.getByRole("option", { name: new RegExp(`${eventLabel} familia 2`) }).click();
    await page.getByRole("checkbox", { name: "Incluir a Renata Prueba en el retiro" }).check();
    await context.setOffline(true);
    await page.waitForFunction(() => !navigator.onLine);
    await page.getByRole("button", { name: "Registrar un módulo" }).click();
    await expect(page.getByText("Retiro pendiente. Quedó guardado en este dispositivo y se validará al reconectar.")).toBeVisible();
    await prisma.distributionEvent.update({ where: { id: eventId }, data: { status: "CERRADA" } });
    await context.setOffline(false);
    await expect(page.getByText("Jornada cerrada")).toBeVisible();
    await expect(page.getByText(/Conflicto al sincronizar:/)).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => prisma.familyDelivery.count({ where: { eventId } })).toBe(1);

    await expect(page.getByText("La jornada está cerrada.")).toBeVisible();
    await expect(page.getByText("Sofía Prueba · DNI cotejado · Firma manuscrita documentada")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar planilla", exact: true }).click();
    const reportDownload = await downloadPromise;
    expect(reportDownload.suggestedFilename()).toContain("preparacion");

    const lateDeliveryId = randomUUID();
    const response = await page.request.post("/api/synchronizations", {
      headers: { origin: baseOrigin },
      data: {
        operationId: randomUUID(),
        userId: identity.userId,
        resource: "records",
        resourceId: lateDeliveryId,
        operation: "create",
        baseVersion: null,
        dependencies: [],
        payload: { kind: "family-delivery", id: lateDeliveryId, eventId, familyId, participants: [{ familyMemberId, paperSignatureChecked: true, physicalDniChecked: true }] },
      },
    });
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "version_conflict" } });
    expect(await prisma.familyDelivery.count({ where: { eventId } })).toBe(1);
    expect(await prisma.familyDelivery.findUnique({ where: { id: familyDeliveryId } })).toBeTruthy();

    await page.getByRole("button", { name: "Reabrir jornada" }).click();
    await page.getByRole("button", { name: "Confirmar reapertura" }).click();
    await expect(page.getByText("La jornada volvió a estar abierta.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar jornada" })).toBeVisible();
    await page.getByRole("button", { name: "Reintentar retiro" }).click();
    await expect(page.getByText("El retiro se sincronizó al reabrir la jornada.")).toBeVisible();
    await expect.poll(() => prisma.familyDelivery.count({ where: { eventId } })).toBe(2);
  } finally {
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
      await prisma.person.deleteMany({ where: { memberships: { none: {} }, referencedBy: { none: {} }, firstName: "Sofía", lastName: "Prueba" } });
    }
    if (secondFamilyId) {
      await prisma.family.deleteMany({ where: { id: secondFamilyId } });
      await prisma.person.deleteMany({ where: { memberships: { none: {} }, referencedBy: { none: {} }, firstName: "Renata", lastName: "Prueba" } });
    }
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
