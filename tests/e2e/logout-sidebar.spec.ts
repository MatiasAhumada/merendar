import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity } from "./browser-identity";

async function captureRouteEvidence(page: Page, testInfo: TestInfo, routeName: string, prefix: string): Promise<number> {
  const signOutButton = page.getByRole("button", { name: "Cerrar sesión", exact: true }).first();
  await expect(signOutButton).toBeVisible();
  const signOutBounds = await signOutButton.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(signOutBounds, "El control de cierre de sesión debe tener límites visibles.");
  assert.ok(viewport, "El navegador de escritorio debe exponer su viewport.");

  const screenshot = await page.screenshot({ fullPage: true });
  await writeFile(testInfo.outputPath(`${prefix}-${routeName}.png`), screenshot);
  await testInfo.attach(`${prefix}-${routeName}.png`, {
    body: screenshot,
    contentType: "image/png",
  });

  return Math.round(signOutBounds.y + signOutBounds.height - viewport.height);
}

test("keeps the desktop sign out control in reach on long pages", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop sidebar geometry is covered in the desktop project.");
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const outOfReachRoutes: string[] = [];
  const evidencePrefix = process.env.EVIDENCE_PREFIX ?? "after";

  try {
    await setBrowserIdentity(context, identity);

    for (const route of ["/entrega", "/mercaderia", "/permisos"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const routeName = route.slice(1);
      const outsideViewportBy = await captureRouteEvidence(page, testInfo, routeName, evidencePrefix);

      if (outsideViewportBy > 0) {
        outOfReachRoutes.push(`${route}: ${outsideViewportBy}px`);
      }
    }

    await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link")).toHaveCount(6);
    expect(outOfReachRoutes, "The sign out control must stay inside the viewport on every long route.").toEqual([]);
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});

test("keeps short desktop navigation scrollable and preserves mobile navigation", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop sidebar geometry is covered in the desktop project.");
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const evidencePrefix = process.env.EVIDENCE_PREFIX ?? "after";

  try {
    await setBrowserIdentity(context, identity);
    await page.setViewportSize({ width: 1440, height: 460 });
    await page.goto("/entrega");
    await page.waitForLoadState("networkidle");

    const desktopNavigation = page.getByRole("navigation", { name: "Navegación principal" });
    const desktopSignOutButton = page.getByRole("button", { name: "Cerrar sesión", exact: true }).first();
    const navigationOverflows = await desktopNavigation.evaluate((navigation) => {
      const element = navigation as HTMLElement;
      return element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto";
    });

    await expect(desktopSignOutButton).toBeInViewport({ ratio: 1 });
    expect(navigationOverflows).toBe(true);
    await desktopNavigation.getByRole("link").last().focus();
    const navigationScrollPosition = await desktopNavigation.evaluate((navigation) => (navigation as HTMLElement).scrollTop);
    expect(navigationScrollPosition).toBeGreaterThan(0);
    await captureRouteEvidence(page, testInfo, "entrega-short-desktop", evidencePrefix);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/entrega");
    await page.waitForLoadState("networkidle");
    const bottomNavigation = page.getByRole("navigation", { name: "Navegación inferior" });
    await expect(bottomNavigation.getByRole("link")).toHaveCount(4);
    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(horizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "Abrir menú" }).click();
    const mobileSignOutButton = page.getByRole("button", { name: "Cerrar sesión", exact: true });
    await expect(mobileSignOutButton).toBeVisible();
    await expect(mobileSignOutButton).toBeEnabled();
    await context.setOffline(true);
    await expect(mobileSignOutButton).toBeDisabled();
    await context.setOffline(false);
    await expect(mobileSignOutButton).toBeEnabled();

    const mobileScreenshot = await page.screenshot({ fullPage: true });
    await writeFile(testInfo.outputPath(`${evidencePrefix}-entrega-mobile.png`), mobileScreenshot);
    await testInfo.attach(`${evidencePrefix}-entrega-mobile.png`, {
      body: mobileScreenshot,
      contentType: "image/png",
    });
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
