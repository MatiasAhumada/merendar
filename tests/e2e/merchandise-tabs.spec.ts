import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity } from "./browser-identity";

test("navigates merchandise tabs with deep links, keyboard, and offline synchronization", async ({ context, page }) => {
  test.setTimeout(60_000);
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const periodLabel = `QA pestañas ${randomUUID()}`;

  try {
    await setBrowserIdentity(context, identity);
    await page.goto("/mercaderia#remitos");
    await expect(page.getByRole("heading", { name: "Recepción de mercadería" })).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(5);
    await expect(page.getByRole("tab", { name: "Remitos" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { includeHidden: true })).toHaveCount(5);
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    const lastTabBottom = await page.getByRole("tab", { name: "Rendiciones" }).evaluate((element) => element.getBoundingClientRect().bottom);
    const activePanelTop = await page.getByRole("tabpanel").evaluate((element) => element.getBoundingClientRect().top);
    expect(activePanelTop).toBeGreaterThanOrEqual(lastTabBottom);

    const deepLinks = [
      { id: "periodos", name: "Períodos" },
      { id: "cupos", name: "Cupos" },
      { id: "remitos", name: "Remitos" },
      { id: "conciliacion", name: "Conciliación" },
      { id: "rendiciones", name: "Rendiciones" },
    ] as const;

    for (const deepLink of deepLinks) {
      await page.goto(`/mercaderia#${deepLink.id}`);
      await expect(page.getByRole("heading", { name: "Recepción de mercadería" })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/mercaderia#${deepLink.id}$`));
      await expect(page.getByRole("tab", { name: deepLink.name })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
    }

    const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    await page.getByRole("tab", { name: "Conciliación" }).click();
    await expect(page).toHaveURL(/\/mercaderia#conciliacion$/);
    await expect(page.getByRole("tab", { name: "Conciliación" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await page.getByRole("tab", { name: "Rendiciones" }).click();
    await expect(page).toHaveURL(/\/mercaderia#rendiciones$/);
    await expect(page.getByRole("tab", { name: "Rendiciones" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await page.getByRole("tab", { name: "Períodos" }).click();
    await expect(page).toHaveURL(/\/mercaderia#periodos$/);
    await expect(page.getByRole("tab", { name: "Períodos" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveCount(1);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Cupos" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\/mercaderia#cupos$/);
    await page.getByRole("tab", { name: "Remitos" }).click();
    await expect(page.getByRole("tab", { name: "Remitos" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\/mercaderia#remitos$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/mercaderia#cupos$/);
    await expect(page.getByRole("tab", { name: "Cupos" })).toHaveAttribute("aria-selected", "true");
    await page.goBack();
    await expect(page).toHaveURL(/\/mercaderia#periodos$/);
    await expect(page.getByRole("tab", { name: "Períodos" })).toHaveAttribute("aria-selected", "true");
    await page.goForward();
    await expect(page).toHaveURL(/\/mercaderia#cupos$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/mercaderia#remitos$/);
    await expect(page.getByRole("tab", { name: "Remitos" })).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);

    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await expect(page.getByText("Sin conexión", { exact: true }).last()).toBeVisible();
    await page.getByRole("tab", { name: "Períodos" }).click();
    await page.getByRole("button", { name: "Nuevo período" }).click();
    await page.getByLabel("Nombre del período *").fill(periodLabel);
    await page.getByLabel("Organismo *").fill("Prueba de navegación");
    await page.getByLabel("Desde *").fill("2026-11-01");
    await page.getByLabel("Hasta *").fill("2026-11-30");
    await page.getByRole("button", { name: "Guardar período" }).click();
    await expect(page.getByText(periodLabel, { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Remitos" }).click();
    await expect(page.getByRole("tabpanel").getByText(periodLabel, { exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Períodos" }).click();
    await expect(page.getByRole("tabpanel").getByText(periodLabel, { exact: true })).toBeVisible();

    await context.setOffline(false);
    await expect.poll(async () => prisma.merchandisePeriod.count({ where: { label: periodLabel } }), { timeout: 20_000 }).toBe(1);
    await expect(page.getByText("Cambios guardados en este dispositivo", { exact: false })).toHaveCount(0);
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await prisma.merchandisePeriod.deleteMany({ where: { label: periodLabel } });
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
