import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { prisma } from "@/lib/prisma";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity } from "./browser-identity";
import { merchandiseSynchronizationHandler } from "@/server/services/merchandise-synchronization.service";
import { synchronizationService } from "@/server/services/synchronization.service";

test("cancels a period with history and rejects a previously queued request", async ({ context, page }) => {
  test.setTimeout(90_000);
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const periodLabel = `COD1597 Cancelación ${suffix}`;
  const requestNumber = `COD1597-REQ-${suffix}`;
  const queuedPeriodLabel = `COD1597 Cola ${suffix}`;
  const queuedRequestNumber = `COD1597-QUEUED-${suffix}`;
  const pageErrors: string[] = [];

  try {
    await setBrowserIdentity(context, identity);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/mercaderia#periodos");
    await expect(page.getByRole("heading", { name: "Recepción de mercadería" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await createPeriod(page, periodLabel);

    const historicalPeriodCard = page.getByRole("heading", { name: periodLabel, exact: true }).locator("xpath=ancestor::div[@data-slot='card'][1]");
    await historicalPeriodCard.getByRole("button", { name: "Registrar solicitud" }).click();
    await page.getByLabel("Número de solicitud *").fill(requestNumber);
    await page.getByLabel("Fecha de presentación *").fill("2026-11-16");
    await page.getByLabel("Módulos solicitados *").fill("2");
    await page.getByRole("button", { name: "Guardar solicitud" }).click();
    await expect(historicalPeriodCard.getByRole("heading", { name: `Solicitud ${requestNumber}` })).toBeVisible();
    await expect(historicalPeriodCard.getByRole("button", { name: "Anular", exact: true })).toBeVisible();

    await historicalPeriodCard.getByRole("button", { name: "Anular", exact: true }).click();
    await page.getByLabel("Motivo de anulación *").fill("Se conserva el historial del período.");
    await expect(page.getByLabel("Motivo de anulación *")).toHaveValue("Se conserva el historial del período.");
    await page.getByRole("button", { name: "Anular período" }).last().click();

    await expect(historicalPeriodCard.getByRole("paragraph").filter({ hasText: "Período anulado. No admite nuevas operaciones." })).toBeVisible();
    await expect(historicalPeriodCard.getByText("Se conserva el historial del período.")).toBeVisible();
    await expect(historicalPeriodCard.getByText("Anulado por: Browser PRESIDENTE")).toBeVisible();
    await expect(historicalPeriodCard.getByRole("heading", { name: `Solicitud ${requestNumber}` })).toBeVisible();
    await expect(historicalPeriodCard.getByRole("button", { name: "Registrar solicitud" })).toHaveCount(0);

    await createPeriod(page, queuedPeriodLabel);
    const queuedPeriodCard = page.getByRole("heading", { name: queuedPeriodLabel, exact: true }).locator("xpath=ancestor::div[@data-slot='card'][1]");
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await expect(page.getByText("Sin conexión", { exact: true }).last()).toBeVisible();
    await queuedPeriodCard.getByRole("button", { name: "Registrar solicitud" }).click();
    await page.getByLabel("Número de solicitud *").fill(queuedRequestNumber);
    await page.getByLabel("Fecha de presentación *").fill("2026-11-17");
    await page.getByLabel("Módulos solicitados *").fill("1");
    await page.getByRole("button", { name: "Guardar solicitud" }).click();
    await expect(queuedPeriodCard.getByRole("heading", { name: `Solicitud ${queuedRequestNumber}` })).toBeVisible();

    const queuedPeriod = await prisma.merchandisePeriod.findFirst({ where: { label: queuedPeriodLabel } });
    expect(queuedPeriod).not.toBeNull();
    const cancellationOperation: SubmittedSyncOperation = {
      operationId: randomUUID(),
      userId: identity.userId,
      resource: "remittances",
      resourceId: queuedPeriod.id,
      operation: "delete",
      baseVersion: queuedPeriod.version,
      dependencies: [],
      payload: { kind: "period", id: queuedPeriod.id, action: "cancel", reason: "Cierre previo a sincronización." },
    };
    await synchronizationService.apply(cancellationOperation, "REMITTANCES", merchandiseSynchronizationHandler);

    await context.setOffline(false);
    await page.getByRole("button", { name: "Sincronizar ahora" }).first().click();
    await expect.poll(async () => page.evaluate(async ({ requestNumberValue, userId }) => {
      const databaseRequest = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 2);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        databaseRequest.onsuccess = () => resolve(databaseRequest.result);
        databaseRequest.onerror = () => reject(databaseRequest.error);
      });
      const operations = await new Promise<Array<{ payload: { requestNumber?: string }; status: string }>>((resolve, reject) => {
        const transaction = database.transaction("operations", "readonly");
        const request = transaction.objectStore("operations").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return operations.find((operation) => operation.payload.requestNumber === requestNumberValue)?.status;
    }, { requestNumberValue: queuedRequestNumber, userId: identity.userId })).toBe("conflict");
    await expect.poll(() => prisma.merchandiseRequest.count({ where: { requestNumber: queuedRequestNumber } })).toBe(0);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await prisma.merchandiseRequest.deleteMany({ where: { period: { label: { in: [periodLabel, queuedPeriodLabel] } } } });
    await prisma.synchronizationReceipt.deleteMany({ where: { userId: identity.userId } });
    await prisma.merchandisePeriod.deleteMany({ where: { label: { in: [periodLabel, queuedPeriodLabel] } } });
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});

async function createPeriod(page: import("@playwright/test").Page, label: string) {
  await page.getByRole("button", { name: "Nuevo período" }).click();
  await page.getByLabel("Nombre del período *").fill(label);
  await page.getByLabel("Organismo *").fill("COD1597 QA sintético");
  await page.getByLabel("Desde *").fill("2026-11-01");
  await page.getByLabel("Hasta *").fill("2026-11-30");
  await expect(page.getByLabel("Nombre del período *")).toHaveValue(label);
  await expect(page.getByLabel("Organismo *")).toHaveValue("COD1597 QA sintético");
  await page.getByRole("button", { name: "Guardar período" }).click();
  await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
}
