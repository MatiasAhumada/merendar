import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity } from "./browser-identity";

test("consulta el historial entre períodos, aplica filtros combinados y conserva la consulta offline", async ({ context, page }) => {
  test.setTimeout(90_000);
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const periodIds = [randomUUID(), randomUUID()];
  const familyId = randomUUID();
  const personId = randomUUID();
  const memberId = randomUUID();
  const eventId = randomUUID();
  const deliveryId = randomUUID();
  const participantId = randomUUID();
  const sheetId = randomUUID();
  const renditionId = randomUUID();
  const historyRecordIds = [randomUUID(), randomUUID()];
  const familyName = `Familia inactiva COD1600 ${suffix.slice(0, 8)}`;
  const periodLabels = [`COD1600 período uno ${suffix.slice(0, 8)}`, `COD1600 período rendido ${suffix.slice(0, 8)}`];
  const periodMonths = ["10", "11"];

  try {
    for (const [index, periodId] of periodIds.entries()) {
      await prisma.merchandisePeriod.create({ data: { id: periodId, label: periodLabels[index] as string, agency: `QA COD1600 ${suffix.slice(0, 8)}`, startsAt: new Date(`2026-${periodMonths[index]}-01T00:00:00.000Z`), endsAt: new Date(`2026-${periodMonths[index]}-30T00:00:00.000Z`) } });
    }
    await prisma.person.create({ data: { id: personId, firstName: "Ana", lastName: "Historial", dni: suffix.replace(/\D/g, "").slice(0, 8).padEnd(8, "1") } });
    await prisma.family.create({
      data: {
        id: familyId, name: familyName, neighborhood: "Barrio COD1600", address: "Domicilio COD1600", referencePersonId: personId,
        createdById: identity.userId, deactivatedAt: new Date("2026-11-20T00:00:00.000Z"), deactivatedById: identity.userId,
        members: { create: { id: memberId, personId, relationship: "Referente", deactivatedAt: new Date("2026-11-20T00:00:00.000Z"), deactivatedById: identity.userId } },
      },
    });
    await prisma.distributionRecord.create({
      data: { id: historyRecordIds[0] as string, operationId: randomUUID(), periodId: periodIds[0] as string, familyMemberId: memberId, receivedAt: new Date("2026-10-15T00:00:00.000Z"), moduleType: "Módulo familiar", quantity: 1, createdById: identity.userId },
    });
    await prisma.distributionEvent.create({ data: { id: eventId, periodId: periodIds[1] as string, scheduledAt: new Date("2026-11-15T00:00:00.000Z"), location: "Salón COD1600", responsibleNames: "Equipo COD1600", createdById: identity.userId } });
    await prisma.familyDelivery.create({ data: { id: deliveryId, eventId, familyId, moduleQuantity: 2, recordedById: identity.userId } });
    await prisma.distributionParticipant.create({ data: { id: participantId, familyDeliveryId: deliveryId, familyMemberId: memberId, recordedById: identity.userId } });
    await prisma.distributionRecord.create({
      data: { id: historyRecordIds[1] as string, operationId: randomUUID(), periodId: periodIds[1] as string, familyMemberId: memberId, familyDeliveryId: deliveryId, receivedAt: new Date("2026-11-15T00:00:00.000Z"), moduleType: "Módulo familiar", quantity: 2, createdById: identity.userId },
    });
    await prisma.beneficiarySheet.create({ data: { id: sheetId, periodId: periodIds[1] as string, version: 1, snapshot: { period: { label: periodLabels[1] }, version: 1, createdAt: new Date().toISOString(), beneficiaries: [] }, createdById: identity.userId } });
    await prisma.rendition.create({ data: { id: renditionId, periodId: periodIds[1] as string, beneficiarySheetId: sheetId, createdById: identity.userId } });

    await setBrowserIdentity(context, identity);
    await page.route("**/api/records/sheets/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" });
    });
    await page.goto("/entrega");
    await expect(page.getByText("Historial de entregas", { exact: true })).toBeVisible();
    await expect(page.getByText(periodLabels[0] as string).last()).toBeVisible();
    await expect(page.getByText(periodLabels[1] as string).last()).toBeVisible();
    await expect(page.getByText(familyName).first()).toBeVisible();

    await page.getByLabel("Persona, DNI o familia").fill("Ana");
    await page.locator("#history-family").fill(familyName);
    await page.getByLabel("Desde").fill("2026-11-01");
    await page.getByLabel("Hasta").fill("2026-11-30");
    await expect(page.getByText(periodLabels[1] as string)).toBeVisible();
    await expect(page.getByText(periodLabels[0] as string)).toHaveCount(0);
    await expect(page.getByText("1 entrega")).toBeVisible();
    await page.getByLabel("Persona, DNI o familia").fill("sin coincidencias COD1600");
    await expect(page.getByText("No hay entregas que coincidan con estos filtros.")).toBeVisible();

    await page.getByLabel("Persona, DNI o familia").fill("");
    await page.locator("#history-family").fill("");
    await page.getByLabel("Desde").fill("");
    await page.getByLabel("Hasta").fill("");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Consulta sin conexión: muestra únicamente el historial guardado en la preparación vigente de este dispositivo.")).toBeVisible();
    await expect(page.getByText(periodLabels[0] as string).last()).toBeVisible();
    await expect(page.getByText(periodLabels[1] as string).last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await prisma.rendition.deleteMany({ where: { id: renditionId } });
    await prisma.beneficiarySheet.deleteMany({ where: { id: sheetId } });
    await prisma.distributionRecord.deleteMany({ where: { id: { in: historyRecordIds } } });
    await prisma.distributionParticipant.deleteMany({ where: { id: participantId } });
    await prisma.familyDelivery.deleteMany({ where: { id: deliveryId } });
    await prisma.distributionEvent.deleteMany({ where: { id: eventId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.person.deleteMany({ where: { id: personId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: { in: periodIds } } });
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
