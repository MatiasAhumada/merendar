import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { MerchandiseDestination, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity } from "./browser-identity";

test("quita filas de familias del borrador y sincroniza solo las filas restantes", async ({ context, page }) => {
  test.setTimeout(90_000);
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const periodId = randomUUID();
  const familyIds = [randomUUID(), randomUUID()];
  const requestIds = [randomUUID(), randomUUID()];
  const quotaIds = [randomUUID(), randomUUID()];
  const remittanceIds = [randomUUID(), randomUUID()];
  const familyNames = [`COD1599 Familia A ${suffix.slice(0, 8)}`, `COD1599 Familia B ${suffix.slice(0, 8)}`];
  let synchronizationPayload: Record<string, unknown> | undefined;
  let synchronizationCalls = 0;

  try {
    await prisma.merchandisePeriod.create({ data: { id: periodId, label: `COD1599 Familias ${suffix}`, agency: "QA COD1599", startsAt: new Date("2026-11-01T00:00:00.000Z"), endsAt: new Date("2026-11-30T00:00:00.000Z") } });
    await prisma.family.createMany({ data: familyIds.map((id, index) => ({ id, name: familyNames[index] as string, neighborhood: "Barrio QA COD1599", address: "Domicilio QA COD1599", createdById: identity.userId })) });
    for (const [index, requestId] of requestIds.entries()) {
      await prisma.merchandiseRequest.create({ data: { id: requestId, periodId, requestNumber: `COD1599-${suffix}-${index}`, requestedAt: new Date("2026-11-01T00:00:00.000Z"), requestedQuantity: 2, createdById: identity.userId } });
      await prisma.merchandiseQuota.create({ data: { id: quotaIds[index] as string, requestId, approvedQuantity: 2, approvedAt: new Date("2026-11-01T00:00:00.000Z"), approvedById: identity.userId } });
      await prisma.merchandiseRemittance.create({ data: { id: remittanceIds[index] as string, requestId, quotaId: quotaIds[index] as string, remittanceNumber: `COD1599-R-${suffix}-${index}`, receivedAt: new Date("2026-11-02T00:00:00.000Z"), receivedQuantity: 2, responsibleName: "Equipo QA", createdById: identity.userId } });
    }

    await setBrowserIdentity(context, identity);
    page.on("request", (request) => {
      if (request.url().endsWith("/api/synchronizations")) {
        synchronizationCalls += 1;
        synchronizationPayload = request.postDataJSON() as Record<string, unknown>;
      }
    });
    await page.goto("/entrega");
    await expect(page.getByRole("heading", { name: "Beneficiarios y planillas" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#record-period").click();
    await page.getByRole("option", { name: new RegExp(`COD1599 Familias ${suffix}`) }).click();
    await expect(page.getByRole("button", { name: "Quitar familia 1" })).toBeVisible();
    await page.getByRole("button", { name: "Agregar familia" }).click();
    await expect(page.getByRole("button", { name: "Quitar familia 2" })).toBeVisible();
    await page.locator("#allocation-family-0").click();
    await page.getByRole("option", { name: familyNames[0] as string }).click();
    await page.locator("#allocation-source-0").click();
    await page.getByRole("option", { name: new RegExp(`COD1599-R-${suffix}-0`) }).click();
    await page.locator("#allocation-family-1").click();
    await page.getByRole("option", { name: familyNames[1] as string }).click();
    await page.locator("#allocation-source-1").click();
    await page.getByRole("option", { name: new RegExp(`COD1599-R-${suffix}-0`) }).click();
    await page.locator("#allocation-quantity-0").fill("2");
    await page.locator("#distribution-location").fill("Salón sintético COD1599");
    await page.locator("#distribution-responsible").fill("Equipo de prueba");
    await expect(page.getByText("3 módulos previstos")).toBeVisible();
    await expect(page.locator("#allocation-quantity-1")).toHaveAttribute("max", "1");

    const callsBeforeRemoval = synchronizationCalls;
    await page.getByRole("button", { name: "Quitar familia 1" }).click();
    await expect(page.getByText("1 módulo previsto")).toBeVisible();
    expect(synchronizationCalls).toBe(callsBeforeRemoval);
    await expect(page.locator("#allocation-family-0")).toHaveText(familyNames[1] as string);
    await expect(page.locator("#allocation-quantity-0")).toHaveAttribute("max", "2");
    await page.getByRole("button", { name: "Quitar familia 1" }).click();
    await expect(page.getByText("Agregá al menos una familia para guardar la preparación.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar y descargar planilla" })).toBeDisabled();
    expect(synchronizationCalls).toBe(callsBeforeRemoval);

    await page.getByRole("button", { name: "Agregar familia" }).click();
    await page.locator("#allocation-family-0").click();
    await page.getByRole("option", { name: familyNames[1] as string }).click();
    await page.locator("#allocation-source-0").click();
    await page.getByRole("option", { name: new RegExp(`COD1599-R-${suffix}-0`) }).click();
    await page.locator("#distribution-location").fill("Salón sintético COD1599");
    await page.locator("#distribution-responsible").fill("Equipo de prueba");
    let releaseSynchronization: () => void = () => {};
    const synchronizationGate = new Promise<void>((resolve) => { releaseSynchronization = resolve; });
    await page.route("**/api/synchronizations", async (route) => { await synchronizationGate; await route.continue(); });
    const download = page.waitForEvent("download");
    const submit = page.getByRole("button", { name: "Guardar y descargar planilla" }).click();
    await expect(page.getByRole("button", { name: "Quitar familia 1" })).toBeDisabled();
    releaseSynchronization();
    await submit;
    await download;
    await expect.poll(() => synchronizationPayload).toBeDefined();
    const payload = synchronizationPayload?.payload as { allocations: Array<{ familyId: string; remittanceId: string; moduleQuantity: number; notes: string }> };
    expect(payload.allocations).toEqual([{ familyId: familyIds[1], remittanceId: remittanceIds[0], moduleQuantity: 1, notes: "" }]);
    expect(await prisma.distributionAllocation.count({ where: { event: { periodId }, familyId: familyIds[0] } })).toBe(0);
    expect(await prisma.distributionAllocation.count({ where: { event: { periodId }, familyId: familyIds[1] } })).toBe(1);
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await prisma.distributionAllocation.deleteMany({ where: { event: { periodId } } });
    await prisma.distributionEvent.deleteMany({ where: { periodId } });
    await prisma.merchandiseRemittance.deleteMany({ where: { id: { in: remittanceIds } } });
    await prisma.merchandiseQuota.deleteMany({ where: { id: { in: quotaIds } } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.family.deleteMany({ where: { id: { in: familyIds } } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});

test("quita filas de insumos del borrador y deshabilita el guardado al vaciar", async ({ context, page }) => {
  test.setTimeout(90_000);
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const periodId = randomUUID();
  const requestIds = [randomUUID(), randomUUID()];
  const quotaIds = [randomUUID(), randomUUID()];
  const requestItemIds = [randomUUID(), randomUUID()];
  const quotaItemIds = [randomUUID(), randomUUID()];
  const remittanceIds = [randomUUID(), randomUUID()];
  const receiptItemIds = [randomUUID(), randomUUID()];
  let synchronizationPayload: Record<string, unknown> | undefined;
  let synchronizationCalls = 0;

  try {
    await prisma.merchandisePeriod.create({ data: { id: periodId, label: `COD1599 Insumos ${suffix}`, agency: "QA COD1599", destination: MerchandiseDestination.MERENDERO, startsAt: new Date("2026-11-01T00:00:00.000Z"), endsAt: new Date("2026-11-30T00:00:00.000Z") } });
    for (const [index, requestId] of requestIds.entries()) {
      await prisma.merchandiseRequest.create({ data: { id: requestId, periodId, requestNumber: `COD1599-S-${suffix}-${index}`, requestedAt: new Date("2026-11-01T00:00:00.000Z"), requestedQuantity: 2, createdById: identity.userId, items: { create: { id: requestItemIds[index] as string, productName: `Producto COD1599 ${index}`, presentation: "Bolsa", unit: "kg", requestedQuantity: 2 } } } });
    }
    for (const [index, requestId] of requestIds.entries()) {
      await prisma.merchandiseQuota.create({ data: { id: quotaIds[index] as string, requestId, approvedQuantity: 2, approvedAt: new Date("2026-11-01T00:00:00.000Z"), approvedById: identity.userId, items: { create: { id: quotaItemIds[index] as string, requestItemId: requestItemIds[index] as string, authorizedQuantity: 2 } } } });
    }
    for (const [index, remittanceId] of remittanceIds.entries()) {
      await prisma.merchandiseRemittance.create({ data: { id: remittanceId, requestId: requestIds[index] as string, quotaId: quotaIds[index] as string, remittanceNumber: `COD1599-SR-${suffix}-${index}`, receivedAt: new Date("2026-11-02T00:00:00.000Z"), receivedQuantity: 0, responsibleName: "Equipo QA", createdById: identity.userId, items: { create: { id: receiptItemIds[index] as string, quotaItemId: quotaItemIds[index] as string, receivedQuantity: 2 } } } });
    }

    await setBrowserIdentity(context, identity);
    page.on("request", (request) => {
      if (request.url().endsWith("/api/synchronizations")) {
        synchronizationCalls += 1;
        synchronizationPayload = request.postDataJSON() as Record<string, unknown>;
      }
    });
    await page.goto("/entrega");
    await expect(page.getByRole("heading", { name: "Beneficiarios y planillas" })).toBeVisible({ timeout: 30_000 });
    await page.locator("#record-period").click();
    await page.getByRole("option", { name: new RegExp(`COD1599 Insumos ${suffix}`) }).click();
    await expect(page.getByRole("button", { name: "Quitar producto 1" })).toBeVisible();
    await page.getByRole("button", { name: "Agregar producto" }).click();
    await page.locator("#supply-source-0").click();
    await page.getByRole("option", { name: new RegExp(`Producto COD1599 0`) }).click();
    await page.locator("#supply-source-1").click();
    await page.getByRole("option", { name: new RegExp(`Producto COD1599 0`) }).click();
    await page.locator("#distribution-location").fill("Merendero sintético COD1599");
    await page.locator("#distribution-responsible").fill("Equipo de prueba");
    await expect(page.getByText("2 productos")).toBeVisible();
    await expect(page.locator("#supply-quantity-1")).toHaveAttribute("max", "1");

    const callsBeforeRemoval = synchronizationCalls;
    await page.getByRole("button", { name: "Quitar producto 1" }).click();
    await expect(page.getByText("1 producto", { exact: true })).toBeVisible();
    expect(synchronizationCalls).toBe(callsBeforeRemoval);
    await expect(page.locator("#supply-source-0")).toContainText("Producto COD1599 0");
    await expect(page.locator("#supply-quantity-0")).toHaveAttribute("max", "2");
    await page.getByRole("button", { name: "Quitar producto 1" }).click();
    await expect(page.getByText("Agregá al menos un producto para guardar la preparación.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar y descargar planilla" })).toBeDisabled();
    expect(synchronizationCalls).toBe(callsBeforeRemoval);

    await page.getByRole("button", { name: "Agregar producto" }).click();
    await page.locator("#supply-source-0").click();
    await page.getByRole("option", { name: new RegExp(`Producto COD1599 0`) }).click();
    await page.locator("#distribution-location").fill("Merendero sintético COD1599");
    await page.locator("#distribution-responsible").fill("Equipo de prueba");
    let releaseSynchronization: () => void = () => {};
    const synchronizationGate = new Promise<void>((resolve) => { releaseSynchronization = resolve; });
    await page.route("**/api/synchronizations", async (route) => { await synchronizationGate; await route.continue(); });
    const download = page.waitForEvent("download");
    const submit = page.getByRole("button", { name: "Guardar y descargar planilla" }).click();
    await expect(page.getByRole("button", { name: "Quitar producto 1" })).toBeDisabled();
    releaseSynchronization();
    await submit;
    await download;
    await expect.poll(() => synchronizationPayload).toBeDefined();
    const payload = synchronizationPayload?.payload as { supplyAllocations: Array<{ receiptItemId: string; quantity: number; notes: string }> };
    expect(payload.supplyAllocations).toEqual([{ receiptItemId: receiptItemIds[0], quantity: 1, notes: "" }]);
    expect(await prisma.distributionSupplyAllocation.count({ where: { event: { periodId }, receiptItemId: receiptItemIds[1] } })).toBe(0);
    expect(await prisma.distributionSupplyAllocation.count({ where: { event: { periodId }, receiptItemId: receiptItemIds[0] } })).toBe(1);
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await prisma.distributionSupplyAllocation.deleteMany({ where: { event: { periodId } } });
    await prisma.distributionEvent.deleteMany({ where: { periodId } });
    await prisma.merchandiseReceiptItem.deleteMany({ where: { id: { in: receiptItemIds } } });
    await prisma.merchandiseRemittance.deleteMany({ where: { id: { in: remittanceIds } } });
    await prisma.merchandiseQuotaItem.deleteMany({ where: { id: { in: quotaItemIds } } });
    await prisma.merchandiseQuota.deleteMany({ where: { id: { in: quotaIds } } });
    await prisma.merchandiseRequestItem.deleteMany({ where: { id: { in: requestItemIds } } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
