import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity, type BrowserIdentity } from "./browser-identity";

test("captures an external authorization, records partial receipts and downloads an internal reconciliation PDF", async ({ browser, context, page }, testInfo) => {
  const identity: BrowserIdentity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomBytes(6).toString("hex");
  const period = await prisma.merchandisePeriod.create({
    data: {
      label: `QA conciliación ${suffix}`,
      agency: "Organismo de prueba",
      destination: "MERENDERO",
      startsAt: new Date("2026-10-01"),
      endsAt: new Date("2026-10-31"),
    },
  });
  const requestNumber = `QA-${suffix}`;
  const request = await prisma.merchandiseRequest.create({
    data: {
      periodId: period.id,
      requestNumber,
      requestedAt: new Date("2026-10-02"),
      requestedQuantity: 8,
      createdById: identity.userId,
      items: { create: { productName: "Harina QA", presentation: "Bolsa 1 kg", unit: "kg", requestedQuantity: 8 } },
    },
  });
  const evidenceDirectory = testInfo.outputPath("merchandise-reconciliation");
  const synchronizationResponses: string[] = [];
  await mkdir(evidenceDirectory, { recursive: true });
  const authorizationPdfPath = `${evidenceDirectory}/authorization-${suffix}.pdf`;
  await writeFile(authorizationPdfPath, Buffer.from("%PDF-1.7\nSynthetic authorization\n%%EOF", "ascii"));

  try {
    page.on("response", async (response) => {
      if (response.url().endsWith("/api/synchronizations")) {
        synchronizationResponses.push(`HTTP ${response.status()}`);
      }
    });
    await setBrowserIdentity(context, identity);
    await page.goto("/mercaderia");
    await expect(page.getByRole("heading", { name: "Recepción de mercadería" })).toBeVisible();
    const requestCard = page.locator("article").filter({ hasText: requestNumber });
    await expect(requestCard).toBeVisible();
    await requestCard.getByRole("button", { name: "Registrar cupo" }).click();
    await page.getByLabel("Cantidad aprobada *").fill("6");
    await page.getByLabel("Fecha de aprobación *").fill("2026-10-03");
    await page.getByLabel("Número de orden externa").fill(`ORD-${suffix}`);
    await page.getByLabel("Persona autorizada a retirar").fill("Responsable sintético QA");
    await page.getByLabel("Vigencia indicada en el documento").fill("2026-10-06");
    await page.getByLabel("Comprobante PDF").setInputFiles(authorizationPdfPath);
    await page.getByRole("button", { name: "Guardar cupo" }).click();

    await expect(requestCard.getByText(`ORD-${suffix}`)).toBeVisible();
    await expect(requestCard.getByText("Responsable sintético QA")).toBeVisible();
    await expect(requestCard.getByRole("button", { name: "Informe de recepción PDF" })).toBeVisible();
    await expect.poll(async () => prisma.merchandiseQuota.findUnique({ where: { requestId: request.id } }), { timeout: 10_000 }).not.toBeNull().catch((error: unknown) => {
      console.log(`Synchronization responses: ${synchronizationResponses.join(", ") || "none"}`);
      throw error;
    });
    const savedQuota = await prisma.merchandiseQuota.findUniqueOrThrow({ where: { requestId: request.id } });
    assert.equal(savedQuota.externalOrderNumber, `ORD-${suffix}`);
    assert.equal(savedQuota.authorizedRecipient, "Responsable sintético QA");
    assert.equal(savedQuota.authorizationValidUntil?.toISOString().slice(0, 10), "2026-10-06");
    const authorizationDocument = await prisma.merchandiseDocument.findFirstOrThrow({ where: { requestId: request.id } });
    assert.equal(authorizationDocument.originalName, `authorization-${suffix}.pdf`);

    const firstDownloadPromise = page.waitForEvent("download");
    await requestCard.getByRole("button", { name: "Informe de recepción PDF" }).click();
    const firstDownload = await firstDownloadPromise;
    const firstReportPath = `${evidenceDirectory}/report-before-receipt.pdf`;
    await firstDownload.saveAs(firstReportPath);

    await requestCard.getByRole("button", { name: "Registrar remito" }).click();
    await page.getByLabel("Número de remito").fill(`REM-${suffix}`);
    await page.getByLabel("Fecha de recepción *").fill("2026-10-04");
    await page.getByLabel("Cantidad recibida *").fill("4.5");
    await page.getByLabel("Responsable de recepción *").fill("Receptor sintético QA");
    await page.getByRole("button", { name: "Guardar remito" }).click();
    await expect(requestCard.getByText("4.5 kg")).toBeVisible();

    const secondDownloadPromise = page.waitForEvent("download");
    await requestCard.getByRole("button", { name: "Informe de recepción PDF" }).click();
    const secondDownload = await secondDownloadPromise;
    const secondReportPath = `${evidenceDirectory}/report-after-receipt.pdf`;
    await secondDownload.saveAs(secondReportPath);
    const firstReport = await readFile(firstReportPath);
    const secondReport = await readFile(secondReportPath);
    assert.equal(firstReport.toString("ascii", 0, 5), "%PDF-");
    assert.equal(secondReport.toString("ascii", 0, 5), "%PDF-");
    assert.ok(firstReport.length > 500);
    assert.ok(secondReport.length > 500);
    await testInfo.attach("reconciliation-report.pdf", { body: secondReport, contentType: "application/pdf" });
    await expect(requestCard.getByText("4.5 kg")).toBeVisible();

    await page.getByRole("link", { name: "Conciliación" }).click();
    await expect(page.getByText("Conciliación histórica del ciclo", { exact: true })).toBeVisible();
    await expect(page.getByText("4.5 kg")).toBeVisible();
    const cycleReportScreenshotPath = testInfo.outputPath("cycle-report.png");
    await page.screenshot({ path: cycleReportScreenshotPath, fullPage: false });
    await testInfo.attach("cycle-reconciliation-screen.png", { path: cycleReportScreenshotPath, contentType: "image/png" });
    const cycleReportDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar reporte PDF" }).click();
    const cycleReportDownload = await cycleReportDownloadPromise;
    const cycleReportPath = `${evidenceDirectory}/cycle-report.pdf`;
    await cycleReportDownload.saveAs(cycleReportPath);
    const cycleReport = await readFile(cycleReportPath);
    assert.equal(cycleReport.toString("ascii", 0, 5), "%PDF-");
    assert.ok(cycleReport.length > 500);
    await testInfo.attach("cycle-reconciliation-report.pdf", { body: cycleReport, contentType: "application/pdf" });

    const savedRemittance = await prisma.merchandiseRemittance.findUniqueOrThrow({ where: { remittanceNumber: `REM-${suffix}` } });
    assert.equal(savedRemittance.receivedQuantity.toNumber(), 4.5);
    await expect(page).toHaveURL(/\/mercaderia#conciliacion$/);
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);
    expect(browser.version()).toBeTruthy();
  } finally {
    await context.setOffline(false);
    await prisma.merchandiseDocument.deleteMany({ where: { requestId: request.id } });
    const quota = await prisma.merchandiseQuota.findUnique({ where: { requestId: request.id } });
    if (quota) {
      await prisma.merchandiseReceiptItem.deleteMany({ where: { quotaItem: { quotaId: quota.id } } });
      await prisma.merchandiseRemittance.deleteMany({ where: { quotaId: quota.id } });
      await prisma.merchandiseQuotaItem.deleteMany({ where: { quotaId: quota.id } });
      await prisma.merchandiseQuota.delete({ where: { id: quota.id } });
    }
    await prisma.merchandiseRequestItem.deleteMany({ where: { requestId: request.id } });
    await prisma.merchandiseRequest.delete({ where: { id: request.id } });
    await prisma.merchandisePeriod.delete({ where: { id: period.id } });
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
