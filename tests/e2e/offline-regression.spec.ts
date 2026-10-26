import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { familyService } from "@/server/services/family.service";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity, type BrowserIdentity } from "./browser-identity";

test("treats the removed /offline URL as an ordinary missing route", async ({ page }) => {
  const response = await page.goto("/offline?route=%2Ffamilias");

  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/offline\?route=%2Ffamilias$/);
});

async function removeBrowserFamily(name: string) {
  const family = await prisma.family.findFirst({ where: { name }, select: { id: true, members: { select: { personId: true } } } });
  if (!family) {
    return;
  }

  await prisma.family.delete({ where: { id: family.id } });
  await prisma.person.deleteMany({
    where: {
      id: { in: family.members.map((member) => member.personId) },
      memberships: { none: {} },
      referencedBy: { none: {} },
    },
  });
}

async function captureBrowserEvidence(browser: Browser, page: Page, testInfo: TestInfo) {
  const evidence = {
    browserName: browser.browserType().name(),
    browserVersion: browser.version(),
    project: testInfo.project.name,
    viewport: testInfo.project.use.viewport,
    commit: process.env.GIT_COMMIT ?? "no informado",
    finalUrl: page.url(),
  };
  await testInfo.attach("browser-evidence.json", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
}

test("renders the role access matrix for every account type", async ({ browser, context, page }, testInfo) => {
  const roles = [
    { role: UserRole.PRESIDENTE, operational: true, administration: true },
    { role: UserRole.SECRETARIA, operational: true, administration: false },
    { role: UserRole.TESORERIA, operational: false, administration: false },
    { role: UserRole.VOCALIA, operational: false, administration: false },
    { role: UserRole.REVISION_CUENTAS, operational: false, administration: false },
  ] as const;
  const identities: BrowserIdentity[] = [];

  try {
    for (const access of roles) {
      const identity = await createBrowserIdentity(access.role);
      identities.push(identity);
      await setBrowserIdentity(context, identity);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: `Hola, Browser ${access.role}` })).toBeVisible();

      const operationalRoutes = ["Familias", "Registro", "Módulos"];
      for (const route of operationalRoutes) {
        await expect(page.getByRole("link", { name: route, exact: true })).toHaveCount(access.operational ? 1 : 0);
      }

      await expect(page.getByRole("link", { name: /Administrar usuarios/ })).toHaveCount(access.administration ? 1 : 0);
      await expect(page.getByRole("link", { name: /Administrar permisos/ })).toHaveCount(access.administration ? 1 : 0);

      if (!access.operational) {
        await expect(page.getByText("Tu cuenta todavía no tiene módulos operativos", { exact: true })).toBeVisible();
      }
      await expect(page.getByRole("link", { name: /Padrón familiar/ })).toHaveCount(access.operational ? 1 : 0);
    }

    await captureBrowserEvidence(browser, page, testInfo);
  } finally {
    await context.setOffline(false);
    await Promise.all(identities.map(removeBrowserIdentity));
    await prisma.$disconnect();
  }
});

test("prepares private views automatically from a deep route, keeps them available after network loss, and isolates a second account", async ({ browser, context, page }, testInfo) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  let secretary: BrowserIdentity | undefined;

  try {
    await setBrowserIdentity(context, president);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/familias");
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Preparar offline" })).toHaveCount(0);

    const preparedSnapshot = await page.evaluate(async (userId) => {
      const databaseRequest = indexedDB.open(`merendar-offline-preparation-${encodeURIComponent(userId)}`, 3);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        databaseRequest.onsuccess = () => resolve(databaseRequest.result);
        databaseRequest.onerror = () => reject(databaseRequest.error);
      });
      const snapshot = await new Promise<{ snapshots: Record<string, unknown> } | undefined>((resolve, reject) => {
        const request = database.transaction("workspace", "readonly").objectStore("workspace").get("latest");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return Object.keys(snapshot?.snapshots ?? {});
    }, president.userId);
    expect(preparedSnapshot).toEqual(expect.arrayContaining(["/", "/familias", "/mercaderia", "/entrega", "/usuarios", "/permisos"]));

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const privateCacheCheck = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const publicCacheName = cacheNames.find((cacheName) => cacheName.startsWith("merendar-public-"));
      if (!publicCacheName) {
        return { cacheNames, privateApiCached: false, privateRouteCached: false, cachedPaths: [] as string[] };
      }
      const publicCache = await caches.open(publicCacheName);
      const cachedRequests = await publicCache.keys();
      return {
        cacheNames,
        privateApiCached: Boolean(await publicCache.match("/api/families")),
        privateRouteCached: Boolean(await publicCache.match("/familias")),
        cachedPaths: cachedRequests.map((request) => new URL(request.url).pathname),
      };
    });
    expect(privateCacheCheck.cacheNames).toEqual(["merendar-public-v6"]);
    expect(privateCacheCheck.privateApiCached).toBe(false);
    expect(privateCacheCheck.privateRouteCached).toBe(true);
    expect(privateCacheCheck.cachedPaths.some((path) => path.startsWith("/api/"))).toBe(false);

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/familias(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    expect(pageErrors).toEqual([]);

    secretary = await createBrowserIdentity(UserRole.TESORERIA);
    await context.setOffline(false);
    await setBrowserIdentity(context, secretary);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: `Hola, Browser ${UserRole.TESORERIA}` })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(async (expectedUserId) => {
      const databaseRequest = indexedDB.open("merendar-offline-account-index", 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        databaseRequest.onsuccess = () => resolve(databaseRequest.result);
        databaseRequest.onerror = () => reject(databaseRequest.error);
      });
      const activeUser = await new Promise<string | null>((resolve, reject) => {
        const request = database.transaction("active-account", "readonly").objectStore("active-account").get("active");
        request.onsuccess = () => resolve(request.result?.userId ?? null);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return activeUser === expectedUserId;
    }, secretary.userId);
    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page.getByText("Acceso no habilitado", { exact: true })).toBeVisible();
    await expect(page.getByText("Este módulo no está habilitado para tu rol.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Datos privados recuperados del almacenamiento local de Browser/)).toHaveCount(0);
    const isolationScreenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("offline-account-isolation.png", {
      body: isolationScreenshot,
      contentType: "image/png",
    });
    await captureBrowserEvidence(browser, page, testInfo);
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(president);
    if (secretary) {
      await removeBrowserIdentity(secretary);
    }
    await prisma.$disconnect();
  }
});

test("keeps the canonical family view and URL when connectivity drops", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);

  try {
    await setBrowserIdentity(context, president);
    await page.goto("/familias");
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await expect(page.getByRole("status", { name: "Sin conexión" })).toBeVisible();
    await expect(page).toHaveURL(/\/familias$/);
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acceso sin conexión" })).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("navigates and reloads canonical views offline using their shared composition", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);

  try {
    await setBrowserIdentity(context, president);
    await page.goto("/familias");
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await page.getByRole("link", { name: "Registro", exact: true }).first().click();
    await expect(page).toHaveURL(/\/entrega$/);
    await expect(page.getByRole("heading", { name: "Beneficiarios y planillas" })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/entrega$/);
    await expect(page.getByRole("heading", { name: "Beneficiarios y planillas" })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("keeps the canonical dashboard and prepared metrics when connectivity drops", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);

  try {
    await setBrowserIdentity(context, president);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hola, Browser PRESIDENTE" })).toBeVisible();
    await expect(page.getByText("Resumen del padrón y cupos", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });

    await context.setOffline(true);
    await expect(page.getByRole("status", { name: "Sin conexión" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Hola, Browser PRESIDENTE" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Resumen guardado para consulta" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acceso sin conexión" })).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("keeps authorized user and access-policy reads offline while disabling writes", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);

  try {
    await setBrowserIdentity(context, president);
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await context.setOffline(true);
    await expect(page.getByRole("status", { name: "Sin conexión" })).toBeVisible();
    await expect(page).toHaveURL(/\/usuarios$/);
    await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear usuario" })).toBeDisabled();

    await context.setOffline(false);
    await page.goto("/permisos");
    await expect(page.getByRole("heading", { name: "Permisos por rol" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await context.setOffline(true);
    await expect(page.getByRole("status", { name: "Sin conexión" })).toBeVisible();
    await expect(page).toHaveURL(/\/permisos$/);
    await expect(page.getByRole("heading", { name: "Permisos por rol" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Revisar y guardar/ })).toBeDisabled();
    await expect(page.getByRole("checkbox").first()).toBeDisabled();
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("refreshes stale public route shells after the service worker update", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);

  try {
    await setBrowserIdentity(context, president);
    await page.goto("/familias");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const previousPreparedAt = await page.evaluate(async (userId) => {
      const databaseRequest = indexedDB.open(`merendar-offline-preparation-${encodeURIComponent(userId)}`, 3);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        databaseRequest.onsuccess = () => resolve(databaseRequest.result);
        databaseRequest.onerror = () => reject(databaseRequest.error);
      });
      const preparation = await new Promise<{ preparedAt: string } | undefined>((resolve, reject) => {
        const request = database.transaction("workspace", "readonly").objectStore("workspace").get("latest");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return preparation?.preparedAt;
    }, president.userId);
    expect(previousPreparedAt).toBeTruthy();

    await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const publicCacheName = cacheNames.find((cacheName) => cacheName.startsWith("merendar-public-"));
      if (!publicCacheName) {
        throw new Error("No se registró la caché pública del Service Worker.");
      }
      const publicCache = await caches.open(publicCacheName);
      await publicCache.put("/familias", new Response('<!doctype html><html><head><script src="/_next/static/chunks/cod1478-stale-shell.js"></script></head><body>Shell obsoleto</body></html>', {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }));
    });

    await page.evaluate(() => window.dispatchEvent(new Event("merendar-server-data-changed")));
    await expect.poll(async () => page.evaluate(async (userId) => {
      const databaseRequest = indexedDB.open(`merendar-offline-preparation-${encodeURIComponent(userId)}`, 3);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        databaseRequest.onsuccess = () => resolve(databaseRequest.result);
        databaseRequest.onerror = () => reject(databaseRequest.error);
      });
      const preparation = await new Promise<{ preparedAt: string } | undefined>((resolve, reject) => {
        const request = database.transaction("workspace", "readonly").objectStore("workspace").get("latest");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return preparation?.preparedAt;
    }, president.userId), { timeout: 30_000 }).not.toBe(previousPreparedAt);
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible();
    await expect(page.getByText(/No se completó la preparación automática/)).toHaveCount(0);

    const cachedOfflineShell = await page.evaluate(async () => {
      const publicCacheName = (await caches.keys()).find((cacheName) => cacheName.startsWith("merendar-public-"));
      if (!publicCacheName) {
        return "";
      }
      const response = await (await caches.open(publicCacheName)).match("/familias");
      return response ? response.text() : "";
    });
    expect(cachedOfflineShell).not.toContain("cod1478-stale-shell.js");

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/familias(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("prepares merchandise requests without treating them as beneficiary sheet PDFs", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  let periodId: string | null = null;
  let requestId: string | null = null;
  let quotaId: string | null = null;
  let remittanceId: string | null = null;
  const beneficiarySheetRequests: string[] = [];

  try {
    const period = await prisma.merchandisePeriod.create({
      data: {
        label: `COD1478 preparation ${suffix}`,
        agency: "QA browser",
        startsAt: new Date("2026-10-01T00:00:00.000Z"),
        endsAt: new Date("2026-10-31T00:00:00.000Z"),
      },
    });
    periodId = period.id;
    const request = await prisma.merchandiseRequest.create({
      data: {
        periodId: period.id,
        requestNumber: `COD1478-${suffix}`,
        requestedAt: new Date("2026-10-25T00:00:00.000Z"),
        requestedQuantity: 1,
        createdById: president.userId,
      },
    });
    requestId = request.id;
    const quota = await prisma.merchandiseQuota.create({
      data: {
        requestId: request.id,
        approvedQuantity: 1,
        approvedAt: new Date("2026-10-25T00:00:00.000Z"),
        approvedById: president.userId,
      },
    });
    quotaId = quota.id;
    const remittance = await prisma.merchandiseRemittance.create({
      data: {
        requestId: request.id,
        quotaId: quota.id,
        remittanceNumber: `COD1478-REM-${suffix}`,
        receivedAt: new Date("2026-10-25T00:00:00.000Z"),
        receivedQuantity: 1,
        responsibleName: "QA browser",
        createdById: president.userId,
      },
    });
    remittanceId = remittance.id;

    await setBrowserIdentity(context, president);
    page.on("request", (requestEvent) => {
      if (requestEvent.url().includes("/api/records/sheets/")) {
        beneficiarySheetRequests.push(requestEvent.url());
      }
    });
    await page.goto("/mercaderia");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/No se completó la preparación automática/)).toHaveCount(0);
    expect(beneficiarySheetRequests.every((url) => [periodId, requestId, quotaId, remittanceId].every((id) => id && !url.includes(id)))).toBe(true);
  } finally {
    await context.setOffline(false);
    if (remittanceId) {
      await prisma.merchandiseRemittance.delete({ where: { id: remittanceId } });
    }
    if (quotaId) {
      await prisma.merchandiseQuota.delete({ where: { id: quotaId } });
    }
    if (requestId) {
      await prisma.merchandiseRequest.delete({ where: { id: requestId } });
    }
    if (periodId) {
      await prisma.merchandisePeriod.delete({ where: { id: periodId } });
    }
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("creates a dependent merchandise chain offline and synchronizes each operation once", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const periodLabel = `COD1478 Offline ${suffix}`;
  const requestNumber = `COD1478-REQ-${suffix}`;
  const remittanceNumber = `COD1478-REM-${suffix}`;
  let periodId = "";
  let requestId = "";
  let quotaId = "";
  let remittanceId = "";
  const pageErrors: string[] = [];

  try {
    await setBrowserIdentity(context, president);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/mercaderia");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    await page.goto("/mercaderia");
    await expect(page).toHaveURL(/\/mercaderia(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Recepción de mercadería" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Sin conexión" })).toBeVisible();
    await page.getByRole("button", { name: "Nuevo período" }).click();
    await page.locator("#period-label").fill(periodLabel);
    await page.locator("#period-agency").fill("COD1478 QA offline");
    await page.locator("#period-start").fill("2026-10-01");
    await page.locator("#period-end").fill("2026-10-31");
    await page.getByRole("button", { name: "Guardar período" }).click();
    await expect(page.getByRole("heading", { name: periodLabel })).toBeVisible();

    const createdPeriodCard = page.getByRole("heading", { name: periodLabel }).locator("xpath=ancestor::div[@data-slot='card'][1]");
    await createdPeriodCard.getByRole("button", { name: "Registrar solicitud" }).click();
    await page.locator('input[id^="request-number-"]').fill(requestNumber);
    await page.locator('input[id^="request-date-"]').fill("2026-10-25");
    await page.locator('input[id^="request-quantity-"]').fill("3");
    await page.getByRole("button", { name: "Guardar solicitud" }).click();
    await expect(page.getByRole("heading", { name: `Solicitud ${requestNumber}` })).toBeVisible();

    await page.getByRole("button", { name: "Registrar cupo" }).click();
    await page.locator('input[id^="quota-quantity-"]').fill("3");
    await page.locator('input[id^="quota-date-"]').fill("2026-10-25");
    await page.getByRole("button", { name: "Guardar cupo" }).click();

    await page.getByRole("button", { name: "Registrar remito" }).click();
    await page.locator('input[id^="remittance-number-"]').fill(remittanceNumber);
    await page.locator('input[id^="remittance-date-"]').fill("2026-10-25");
    await page.locator('input[id^="remittance-quantity-"]').fill("3");
    await page.locator('input[id^="remittance-manager-"]').fill("Responsable QA offline");
    await page.getByRole("button", { name: "Guardar remito" }).click();
    await expect(page.getByRole("heading", { name: `Remito N° ${remittanceNumber}` })).toBeVisible();

    const queuedOperations = await page.evaluate(async (userId) => {
      const request = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const operations = await new Promise<Array<{ operationId: string; resource: string; dependencies: string[]; resourceId: string; createdAt: string }>>((resolve, reject) => {
        const operationRequest = database.transaction("operations", "readonly").objectStore("operations").getAll();
        operationRequest.onsuccess = () => resolve(operationRequest.result);
        operationRequest.onerror = () => reject(operationRequest.error);
      });
      database.close();
      return operations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }, president.userId);
    expect(queuedOperations).toHaveLength(4);
    expect(queuedOperations.every((operation) => operation.resource === "remittances")).toBe(true);
    periodId = queuedOperations[0]?.resourceId ?? "";
    requestId = queuedOperations[1]?.resourceId ?? "";
    quotaId = queuedOperations[2]?.resourceId ?? "";
    remittanceId = queuedOperations[3]?.resourceId ?? "";
    expect(queuedOperations[1]?.dependencies).toContain(queuedOperations[0]?.operationId);
    expect(queuedOperations[2]?.dependencies).toContain(queuedOperations[1]?.operationId);
    expect(queuedOperations[3]?.dependencies).toEqual(expect.arrayContaining([queuedOperations[1]?.operationId, queuedOperations[2]?.operationId]));
    expect(await prisma.merchandisePeriod.count({ where: { id: periodId } })).toBe(0);

    await context.setOffline(false);
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId: { in: queuedOperations.map((operation) => operation.operationId) } } }), { timeout: 30_000 }).toBe(4);
    const syncedPeriod = await prisma.merchandisePeriod.findUnique({
      where: { id: periodId },
      include: { requests: { include: { quota: true, remittances: true } } },
    });
    expect(syncedPeriod?.requests).toHaveLength(1);
    expect(syncedPeriod?.requests[0]?.quota?.approvedQuantity).toBe(3);
    expect(syncedPeriod?.requests[0]?.remittances).toHaveLength(1);
    expect(syncedPeriod?.requests[0]?.remittances[0]?.receivedQuantity).toBe(3);

    await context.setOffline(true);
    await context.setOffline(false);
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId: { in: queuedOperations.map((operation) => operation.operationId) } } }), { timeout: 10_000 }).toBe(4);
    expect(await prisma.merchandiseRequest.count({ where: { id: requestId } })).toBe(1);
    expect(await prisma.merchandiseQuota.count({ where: { id: quotaId } })).toBe(1);
    expect(await prisma.merchandiseRemittance.count({ where: { id: remittanceId } })).toBe(1);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await prisma.merchandiseRemittance.deleteMany({ where: { id: remittanceId } });
    await prisma.merchandiseQuota.deleteMany({ where: { id: quotaId } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: requestId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("uploads a rendition PDF offline and preserves the file through idempotent synchronization", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const periodLabel = `COD1478 Rendition offline ${suffix}`;
  const originalName = `planilla-firmada-${suffix}.pdf`;
  const pdfContent = Buffer.from("%PDF-1.7\nBrowser synthetic signed sheet\n%%EOF\n");
  let periodId = "";
  let sheetId = "";
  let documentId = "";
  let renditionId = "";
  const pageErrors: string[] = [];

  try {
    const period = await prisma.merchandisePeriod.create({
      data: {
        label: periodLabel,
        agency: "COD1478 QA browser",
        startsAt: new Date("2026-10-01T00:00:00.000Z"),
        endsAt: new Date("2026-10-31T00:00:00.000Z"),
      },
    });
    periodId = period.id;
    const sheet = await prisma.beneficiarySheet.create({
      data: {
        periodId: period.id,
        version: 1,
        createdById: president.userId,
        snapshot: {
          period: { label: period.label, agency: period.agency, startsAt: "2026-10-01", endsAt: "2026-10-31" },
          version: 1,
          createdAt: new Date().toISOString(),
          beneficiaries: [{ personId: randomUUID(), name: "Browser QA", dni: "14802789", familyName: "COD1478 QA", address: "Domicilio sintético" }],
        },
      },
    });
    sheetId = sheet.id;

    await setBrowserIdentity(context, president);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/mercaderia#rendiciones");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("combobox", { name: "Módulo o período" }).click();
    await page.getByRole("option", { name: new RegExp(periodLabel) }).click();
    await expect(page.getByRole("combobox", { name: "Planilla emitida" })).toContainText("Versión 1");
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    await page.goto("/mercaderia");
    await expect(page).toHaveURL(/\/mercaderia(?:\?.*)?$/);
    await expect(page.getByText("Rendición documental", { exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "Sin conexión" })).toBeVisible();
    await page.getByRole("combobox", { name: "Módulo o período" }).click();
    await page.getByRole("option", { name: new RegExp(periodLabel) }).click();
    await page.getByRole("combobox", { name: "Planilla emitida" }).click();
    await page.getByRole("option", { name: /Versión 1/ }).click();
    await page.locator("#rendition-documents").setInputFiles({ name: originalName, mimeType: "application/pdf", buffer: pdfContent });
    await expect(page.getByText(`Seleccionados: ${originalName}`)).toBeVisible();
    await page.getByRole("button", { name: "Guardar documentos" }).click();
    await expect(page.getByRole("region", { name: "Documentación recibida" }).getByText(`Planilla firmada a mano · ${originalName}`)).toBeVisible();

    const queuedOperations = await page.evaluate(async (userId) => {
      const request = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const operations = await new Promise<Array<{ operationId: string; resource: string }>>((resolve, reject) => {
        const operationRequest = database.transaction("operations", "readonly").objectStore("operations").getAll();
        operationRequest.onsuccess = () => resolve(operationRequest.result);
        operationRequest.onerror = () => reject(operationRequest.error);
      });
      database.close();
      return operations;
    }, president.userId);
    expect(queuedOperations).toHaveLength(1);
    expect(queuedOperations[0]?.resource).toBe("renditions");
    expect(await prisma.rendition.count({ where: { beneficiarySheetId: sheet.id } })).toBe(0);
    const operationId = queuedOperations[0]?.operationId;
    expect(operationId).toBeTruthy();

    await context.setOffline(false);
    await expect.poll(async () => prisma.renditionDocument.findFirst({ where: { originalName }, select: { id: true, renditionId: true } }), { timeout: 30_000 }).not.toBeNull();
    const persistedDocument = await prisma.renditionDocument.findFirstOrThrow({ where: { originalName } });
    documentId = persistedDocument.id;
    renditionId = persistedDocument.renditionId;
    expect(persistedDocument.content).toEqual(pdfContent);
    if (!operationId) {
      throw new Error("La operación offline no generó un identificador.");
    }
    expect(await prisma.synchronizationReceipt.count({ where: { operationId } })).toBe(1);

    await context.setOffline(true);
    await context.setOffline(false);
    expect(await prisma.renditionDocument.count({ where: { id: documentId } })).toBe(1);
    expect(await prisma.rendition.count({ where: { beneficiarySheetId: sheetId } })).toBe(1);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await prisma.renditionDocument.deleteMany({ where: { OR: [{ id: documentId }, { renditionId }] } });
    await prisma.rendition.deleteMany({ where: { beneficiarySheetId: sheetId } });
    await prisma.beneficiarySheet.deleteMany({ where: { id: sheetId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("registers a beneficiary offline, emits a local PDF and synchronizes both operations once", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const familyName = `COD1478 Registro offline ${suffix}`;
  const periodLabel = `COD1478 Entrega offline ${suffix}`;
  const beneficiaryName = `Registro ${suffix.slice(0, 8)}`;
  const personDni = `${10_000_000 + Number.parseInt(randomBytes(4).toString("hex"), 16) % 90_000_000}`;
  let periodId = "";
  let familyId = "";
  const pageErrors: string[] = [];

  try {
    const family = await familyService.create({
      name: familyName,
      neighborhood: "San Cayetano",
      address: "Domicilio sintético COD1478",
      contactPhone: "3815551478",
      referenceMemberIndex: 0,
      members: [{ firstName: beneficiaryName, lastName: "Offline", dni: personDni, relationship: "Referente", missingDocuments: [] }],
    }, president.userId, randomUUID());
    familyId = family.id;
    const period = await prisma.merchandisePeriod.create({
      data: {
        label: periodLabel,
        agency: "COD1478 QA browser",
        startsAt: new Date("2026-10-01T00:00:00.000Z"),
        endsAt: new Date("2026-10-31T00:00:00.000Z"),
      },
    });
    periodId = period.id;

    await setBrowserIdentity(context, president);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/entrega");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    await page.goto("/entrega");
    await expect(page).toHaveURL(/\/entrega(?:\?.*)?$/);
    await page.locator("#record-period").click();
    await page.getByRole("option", { name: new RegExp(periodLabel) }).click();
    await page.locator("#record-family").click();
    await page.getByRole("option", { name: new RegExp(familyName) }).click();
    await page.locator("#record-person").click();
    await page.getByRole("option", { name: new RegExp(personDni) }).click();
    await page.locator("#record-type").fill("Módulo offline COD1478");
    await page.locator("#record-quantity").fill("2");
    await page.locator("#record-date").fill("2026-10-25");
    await page.getByRole("button", { name: "Confirmar registro" }).click();
    await expect(page.getByText(/Registro pendiente/)).toBeVisible();

    await page.getByRole("checkbox", { name: new RegExp(`Incluir a ${beneficiaryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).check();
    await page.getByRole("button", { name: /Descargar PDF/ }).click();
    await expect(page.getByText(/Borrador local .* todavía no tiene versión oficial/)).toBeVisible();
    const offlineData = await page.evaluate(async (userId) => {
      const databaseRequest = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        databaseRequest.onsuccess = () => resolve(databaseRequest.result);
        databaseRequest.onerror = () => reject(databaseRequest.error);
      });
      const operations = await new Promise<Array<{ operationId: string; resource: string; resourceId: string }>>((resolve, reject) => {
        const request = database.transaction("operations", "readonly").objectStore("operations").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      const preparationRequest = indexedDB.open(`merendar-offline-preparation-${encodeURIComponent(userId)}`, 3);
      const preparationDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
        preparationRequest.onsuccess = () => resolve(preparationRequest.result);
        preparationRequest.onerror = () => reject(preparationRequest.error);
      });
      const documents = await new Promise<Array<{ id: string; byteSize: number; documentType?: string }>>((resolve, reject) => {
        const request = preparationDatabase.transaction("documents", "readonly").objectStore("documents").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      preparationDatabase.close();
      return { operations, documents };
    }, president.userId);
    expect(offlineData.operations).toHaveLength(2);
    expect(offlineData.operations.every((operation) => operation.resource === "records")).toBe(true);
    const localSheet = offlineData.documents.find((document) => document.documentType === "beneficiary-sheet-local");
    expect(localSheet?.byteSize).toBeGreaterThan(0);
    expect(localSheet?.id).toMatch(/^local:/);

    await context.setOffline(false);
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId: { in: offlineData.operations.map((operation) => operation.operationId) } } }), { timeout: 30_000 }).toBe(2);
    expect(await prisma.distributionRecord.count({ where: { periodId, familyMember: { person: { dni: personDni } } } })).toBe(1);
    const officialSheet = await prisma.beneficiarySheet.findFirst({ where: { periodId } });
    expect(officialSheet?.snapshot).toMatchObject({ beneficiaries: [{ dni: personDni, familyName }] });

    await context.setOffline(true);
    await context.setOffline(false);
    expect(await prisma.distributionRecord.count({ where: { periodId, familyMember: { person: { dni: personDni } } } })).toBe(1);
    expect(await prisma.beneficiarySheet.count({ where: { periodId } })).toBe(1);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await prisma.distributionRecord.deleteMany({ where: { periodId } });
    await prisma.beneficiarySheet.deleteMany({ where: { periodId } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    if (familyId) {
      await prisma.family.deleteMany({ where: { id: familyId } });
      await prisma.person.deleteMany({ where: { dni: personDni, memberships: { none: {} }, referencedBy: { none: {} } } });
    }
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("recovers a confirmed family after a failed list refresh without duplicating it", async ({ browser, context, page }, testInfo) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const familyName = `Browser Online ${randomUUID()}`;
  let failFamilyRefreshes = false;
  let failedFamilyRefreshes = 0;

  try {
    await setBrowserIdentity(context, president);
    await page.route("**/*", async (route) => {
      const requestUrl = new URL(route.request().url());

      if (failFamilyRefreshes && requestUrl.pathname === "/api/families" && route.request().method() === "GET") {
        failedFamilyRefreshes += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Falla de refresco sintética" } }),
        });
        return;
      }

      await route.continue();
    });
    await page.goto("/familias");
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    await page.getByRole("button", { name: "Nueva familia" }).click();
    await page.locator("#family-name").fill(familyName);
    await page.locator("#family-neighborhood").click();
    await page.getByRole("option", { name: "San Cayetano" }).click();
    await page.locator("#family-address").fill("Domicilio de prueba 1478");
    await page.locator("#family-phone").fill("3815550142");
    await page.locator('input[id^="member-first-"]').fill("Integrante");
    await page.locator('input[id^="member-last-"]').fill("Online");
    await page.locator('input[id^="member-dni-"]').fill("14790001");
    failFamilyRefreshes = true;
    await page.getByRole("button", { name: "Guardar familia" }).click();

    await expect(page.getByRole("alert").getByText("La familia ya está confirmada en el servidor, pero no pudimos actualizar el padrón. Reintentá la actualización sin volver a cargarla.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar actualización" })).toBeEnabled();
    await expect.poll(async () => prisma.family.count({ where: { name: familyName } }), { timeout: 15_000 }).toBe(1);
    expect(failedFamilyRefreshes).toBeGreaterThan(0);
    failFamilyRefreshes = false;
    await page.getByRole("button", { name: "Reintentar actualización" }).click();
    await expect(page.getByRole("heading", { name: familyName, exact: true })).toHaveCount(1);
    await expect.poll(async () => prisma.family.count({ where: { name: familyName } }), { timeout: 15_000 }).toBe(1);
    await page.getByRole("searchbox", { name: "Buscar familias" }).fill(familyName);
    await page.getByRole("region", { name: "Listado de familias" }).getByRole("button", { name: "Ver ficha familiar" }).click();
    await expect(page.getByText("Integrantes (1)", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: familyName, exact: true })).toHaveCount(1);

    await captureBrowserEvidence(browser, page, testInfo);
  } finally {
    await context.setOffline(false);
    await removeBrowserFamily(familyName);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("confirms family deactivation, preserves sheet history and explains blocked records", async ({ browser, context, page }, testInfo) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const familyNames = [`COD1484 con planilla ${suffix}`, `COD1484 sin historial ${suffix}`];
  const personDni = `${10_000_000 + Number.parseInt(randomBytes(4).toString("hex"), 16) % 90_000_000}`;
  let periodId: string | null = null;

  try {
    const familyWithSheet = await familyService.create({
      name: familyNames[0] ?? "",
      neighborhood: "Villa Nueva",
      address: "Calle de prueba 1484",
      contactPhone: "381 555 0142",
      referenceMemberIndex: 0,
      members: [{ firstName: "Browser", lastName: "Con historial", dni: personDni, relationship: "Referente", missingDocuments: [] }],
    }, president.userId, randomUUID());
    const secondFamily = await familyService.create({
      name: familyNames[1] ?? "",
      neighborhood: "Villa Nueva",
      address: "Calle de prueba 1485",
      contactPhone: "381 555 0142",
      referenceMemberIndex: 0,
      members: [{ firstName: "Browser", lastName: "Sin historial", dni: `${Number(personDni) + 1}`, relationship: "Referente", missingDocuments: [] }],
    }, president.userId, randomUUID());
    const period = await prisma.merchandisePeriod.create({
      data: {
        label: `COD1484 browser ${suffix}`,
        agency: "Browser test",
        startsAt: new Date("2026-10-01T00:00:00.000Z"),
        endsAt: new Date("2026-10-31T00:00:00.000Z"),
      },
    });
    periodId = period.id;
    const personIdWithSheet = familyWithSheet.members[0]?.id;
    expect(personIdWithSheet).toBeTruthy();
    await prisma.beneficiarySheet.create({
      data: {
        periodId: period.id,
        version: 1,
        createdById: president.userId,
        snapshot: {
          period: {
            label: period.label,
            agency: period.agency,
            startsAt: period.startsAt.toISOString().slice(0, 10),
            endsAt: period.endsAt.toISOString().slice(0, 10),
          },
          version: 1,
          createdAt: new Date().toISOString(),
          beneficiaries: [{
            personId: personIdWithSheet,
            name: "Browser Con historial",
            dni: personDni,
            familyName: familyWithSheet.name,
            address: familyWithSheet.address,
            neighborhood: familyWithSheet.neighborhood,
          }],
        },
      },
    });

    await setBrowserIdentity(context, president);
    const pageErrors: string[] = [];
    const sheetDownloadStatuses: number[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/api/records/sheets/") && !response.ok()) {
        sheetDownloadStatuses.push(response.status());
      }
    });
    await page.goto("/familias");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    expect(sheetDownloadStatuses).toEqual([]);
    await page.getByRole("searchbox", { name: "Buscar familias" }).fill(familyWithSheet.name);
    await page.getByRole("button", { name: "Ver ficha familiar" }).click();
    await page.getByRole("button", { name: "Dar de baja familia" }).click();
    await expect(page.getByRole("heading", { name: "Dar de baja la familia" })).toBeVisible();
    await expect(page.getByText(/Si hay entregas o planillas históricas/)).toBeVisible();
    await testInfo.attach("family-deactivation-confirmation.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "Confirmar baja" }).click();
    await expect(page.getByText(/aparece en entregas o planillas históricas/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: familyWithSheet.name })).toBeVisible();
    expect((await prisma.family.findUniqueOrThrow({ where: { id: familyWithSheet.id }, select: { deactivatedAt: true } })).deactivatedAt).toBeNull();
    await page.getByRole("button", { name: "Cerrar ficha" }).click();

    await page.getByRole("searchbox", { name: "Buscar familias" }).fill(secondFamily.name);
    await page.getByRole("button", { name: "Ver ficha familiar" }).click();
    await page.getByRole("button", { name: "Dar de baja familia" }).click();
    await page.getByRole("button", { name: "Confirmar baja" }).click();
    await expect(page.getByText("No hay resultados", { exact: true })).toBeVisible();
    const deactivatedFamily = await prisma.family.findUniqueOrThrow({ where: { id: secondFamily.id }, select: { deactivatedAt: true, deactivatedById: true } });
    expect(deactivatedFamily.deactivatedAt).toBeTruthy();
    expect(deactivatedFamily.deactivatedById).toBe(president.userId);
    expect(pageErrors).toEqual([]);
    await testInfo.attach("family-deactivation-complete.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await captureBrowserEvidence(browser, page, testInfo);
  } finally {
    await context.setOffline(false);
    await prisma.distributionRecord.deleteMany({ where: { periodId: periodId ?? "" } });
    await prisma.beneficiarySheet.deleteMany({ where: { periodId: periodId ?? "" } });
    await prisma.merchandisePeriod.deleteMany({ where: { id: periodId ?? "" } });
    await Promise.all(familyNames.map(removeBrowserFamily));
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("reports a family as pending when the server has not confirmed synchronization", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const familyName = `Browser Pending ${randomUUID()}`;
  let failNextSynchronization = false;

  try {
    await setBrowserIdentity(context, president);
    await page.route("**/api/synchronizations", async (route) => {
      if (failNextSynchronization && route.request().method() === "POST") {
        failNextSynchronization = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "server_unavailable", message: "Falla de sincronización sintética" } }),
        });
        return;
      }

      await route.continue();
    });
    await page.goto("/familias");
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    await page.getByRole("button", { name: "Nueva familia" }).click();
    await page.locator("#family-name").fill(familyName);
    await page.locator("#family-neighborhood").click();
    await page.getByRole("option", { name: "San Cayetano" }).click();
    await page.locator("#family-address").fill("Domicilio de prueba 1479");
    await page.locator("#family-phone").fill("3815550142");
    await page.locator('input[id^="member-first-"]').fill("Integrante");
    await page.locator('input[id^="member-last-"]').fill("Pendiente");
    await page.locator('input[id^="member-dni-"]').fill("14790004");
    failNextSynchronization = true;
    await page.getByRole("button", { name: "Guardar familia" }).click();

    await expect(page.getByRole("alert").getByText("El borrador quedó guardado en este dispositivo y sigue pendiente de confirmación del servidor. Reintentá la sincronización cuando esté disponible.")).toBeVisible();
    await expect(page.getByText(familyName, { exact: true })).toBeVisible();
    await expect.poll(async () => prisma.family.count({ where: { name: familyName } })).toBe(0);
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("adds a member to a confirmed family after reopening the route offline", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const familyName = `COD1478 Familia confirmada ${randomUUID()}`;
  const originalDni = `${10_000_000 + Number.parseInt(randomBytes(4).toString("hex"), 16) % 90_000_000}`;
  const memberDni = `${10_000_000 + Number.parseInt(randomBytes(4).toString("hex"), 16) % 90_000_000}`;
  let familyId = "";

  try {
    const family = await familyService.create({
      name: familyName,
      neighborhood: "San Cayetano",
      address: "Domicilio de fixture confirmado",
      contactPhone: "3815551478",
      referenceMemberIndex: 0,
      members: [{ firstName: "Familia", lastName: "Confirmada", dni: originalDni, relationship: "Referente", missingDocuments: [] }],
    }, president.userId, randomUUID());
    familyId = family.id;

    await setBrowserIdentity(context, president);
    await page.goto("/familias");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/familias(?:\?.*)?$/);
    await page.getByRole("searchbox", { name: "Buscar familias" }).fill(familyName);
    await page.getByRole("button", { name: "Ver ficha familiar" }).click();
    await page.getByRole("button", { name: "Agregar integrante" }).click();
    await page.locator("#family-member-first-name").fill("Integrante");
    await page.locator("#family-member-last-name").fill("Agregado offline");
    await page.locator("#family-member-dni").fill(memberDni);
    await page.getByRole("button", { name: "Guardar integrante" }).click();
    await expect(page.getByText("Integrantes (2)", { exact: true })).toBeVisible();

    const queuedOperations = await page.evaluate(async (userId) => {
      const request = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const operations = await new Promise<Array<{ operationId: string; resourceId: string; status: string }>>((resolve, reject) => {
        const operationRequest = database.transaction("operations", "readonly").objectStore("operations").getAll();
        operationRequest.onsuccess = () => resolve(operationRequest.result);
        operationRequest.onerror = () => reject(operationRequest.error);
      });
      database.close();
      return operations;
    }, president.userId);
    expect(queuedOperations).toHaveLength(1);
    expect(queuedOperations[0]).toMatchObject({ resourceId: familyId, status: "pending" });
    const operationId = queuedOperations[0]?.operationId;
    expect(operationId).toBeTruthy();
    if (!operationId) {
      throw new Error("La operación offline no generó un identificador.");
    }

    await context.setOffline(false);
    await expect.poll(async () => prisma.familyMember.count({ where: { familyId } }), { timeout: 30_000 }).toBe(2);
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId } }), { timeout: 30_000 }).toBe(1);
    expect(await prisma.person.count({ where: { dni: memberDni, memberships: { some: { familyId } } } })).toBe(1);
  } finally {
    await context.setOffline(false);
    await removeBrowserFamily(familyName);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("edits a confirmed family member after reopening the route offline", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const familyName = `COD1478 Edición offline ${randomUUID()}`;
  const memberDni = `${10_000_000 + Number.parseInt(randomBytes(4).toString("hex"), 16) % 90_000_000}`;
  let familyId = "";

  try {
    const family = await familyService.create({
      name: familyName,
      neighborhood: "San Cayetano",
      address: "Domicilio de fixture para editar",
      contactPhone: "3815551478",
      referenceMemberIndex: 0,
      members: [{ firstName: "Persona", lastName: "Original", dni: memberDni, relationship: "Referente", missingDocuments: [] }],
    }, president.userId, randomUUID());
    familyId = family.id;

    await setBrowserIdentity(context, president);
    await page.goto("/familias");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/familias(?:\?.*)?$/);
    await page.getByRole("searchbox", { name: "Buscar familias" }).fill(familyName);
    await page.getByRole("button", { name: "Ver ficha familiar" }).click();
    await page.getByRole("button", { name: "Editar datos" }).click();
    await page.locator("#family-member-last-name").fill("Actualizado offline");
    await page.getByRole("button", { name: "Guardar integrante" }).click();
    await expect(page.getByText(/Persona Actualizado offline/).first()).toBeVisible();

    const queuedOperations = await page.evaluate(async (userId) => {
      const request = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const operations = await new Promise<Array<{ operationId: string; resourceId: string; status: string }>>((resolve, reject) => {
        const operationRequest = database.transaction("operations", "readonly").objectStore("operations").getAll();
        operationRequest.onsuccess = () => resolve(operationRequest.result);
        operationRequest.onerror = () => reject(operationRequest.error);
      });
      database.close();
      return operations;
    }, president.userId);
    expect(queuedOperations).toHaveLength(1);
    expect(queuedOperations[0]).toMatchObject({ resourceId: familyId, status: "pending" });
    const operationId = queuedOperations[0]?.operationId;
    expect(operationId).toBeTruthy();
    if (!operationId) {
      throw new Error("La operación offline no generó un identificador.");
    }

    await context.setOffline(false);
    await expect.poll(async () => prisma.familyMember.findFirst({ where: { familyId, person: { lastName: "Actualizado offline" } } }), { timeout: 30_000 }).not.toBeNull();
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId } }), { timeout: 30_000 }).toBe(1);
    expect(await prisma.person.count({ where: { dni: memberDni, lastName: "Actualizado offline", memberships: { some: { familyId } } } })).toBe(1);
  } finally {
    await context.setOffline(false);
    await removeBrowserFamily(familyName);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("deactivates a confirmed family offline after reopening the route", async ({ context, page }) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const familyName = `COD1478 Baja offline ${randomUUID()}`;
  const memberDni = `${10_000_000 + Number.parseInt(randomBytes(4).toString("hex"), 16) % 90_000_000}`;
  let familyId = "";

  try {
    const family = await familyService.create({
      name: familyName,
      neighborhood: "San Cayetano",
      address: "Domicilio de fixture para dar de baja",
      contactPhone: "3815551478",
      referenceMemberIndex: 0,
      members: [{ firstName: "Persona", lastName: "Baja", dni: memberDni, relationship: "Referente", missingDocuments: [] }],
    }, president.userId, randomUUID());
    familyId = family.id;

    await setBrowserIdentity(context, president);
    await page.goto("/familias");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/familias(?:\?.*)?$/);
    await page.getByRole("searchbox", { name: "Buscar familias" }).fill(familyName);
    await page.getByRole("button", { name: "Ver ficha familiar" }).click();
    await page.getByRole("button", { name: "Dar de baja familia" }).click();
    await page.getByRole("button", { name: "Confirmar baja" }).click();
    await expect(page.getByRole("button", { name: "Baja pendiente" })).toBeVisible();

    const queuedOperations = await page.evaluate(async (userId) => {
      const request = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const operations = await new Promise<Array<{ operationId: string; resourceId: string; operation: string; status: string }>>((resolve, reject) => {
        const operationRequest = database.transaction("operations", "readonly").objectStore("operations").getAll();
        operationRequest.onsuccess = () => resolve(operationRequest.result);
        operationRequest.onerror = () => reject(operationRequest.error);
      });
      database.close();
      return operations;
    }, president.userId);
    expect(queuedOperations).toHaveLength(1);
    expect(queuedOperations[0]).toMatchObject({ resourceId: familyId, operation: "delete", status: "pending" });
    const operationId = queuedOperations[0]?.operationId;
    expect(operationId).toBeTruthy();
    if (!operationId) {
      throw new Error("La operación offline no generó un identificador.");
    }

    await context.setOffline(false);
    await expect.poll(async () => prisma.family.findUnique({ where: { id: familyId }, select: { deactivatedAt: true } }).then((currentFamily) => currentFamily?.deactivatedAt), { timeout: 30_000 }).not.toBeNull();
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId } }), { timeout: 30_000 }).toBe(1);
  } finally {
    await context.setOffline(false);
    await removeBrowserFamily(familyName);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});

test("creates a family and adds a member offline, then syncs the dependency chain once", async ({ browser, context, page }, testInfo) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const familyName = `Browser Offline ${randomUUID()}`;

  try {
    await setBrowserIdentity(context, president);
    await page.goto("/familias");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Preparar offline" })).toHaveCount(0);
    await page.evaluate(async () => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/familias(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Padrón de familias" })).toBeVisible();
    await page.getByRole("button", { name: "Nueva familia" }).click();
    await page.locator("#family-name").fill(familyName);
    await page.locator("#family-neighborhood").click();
    await page.getByRole("option", { name: "San Cayetano" }).click();
    await page.locator("#family-address").fill("Domicilio de prueba 1478");
    await page.locator("#family-phone").fill("3815550142");
    await page.locator('input[id^="member-first-"]').fill("Integrante");
    await page.locator('input[id^="member-last-"]').fill("Offline");
    await page.locator('input[id^="member-dni-"]').fill("14790002");
    await page.getByRole("button", { name: "Guardar familia" }).click();
    await expect(page.getByText(familyName, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Listado de familias" }).getByText(familyName, { exact: true })).toBeVisible();

    await page.getByRole("region", { name: "Listado de familias" }).getByRole("button", { name: "Ver ficha familiar" }).last().click();
    await page.getByRole("button", { name: "Agregar integrante" }).click();
    await page.locator("#family-member-first-name").fill("Segundo");
    await page.locator("#family-member-last-name").fill("Offline");
    await page.locator("#family-member-dni").fill("14790003");
    await page.getByRole("button", { name: "Guardar integrante" }).click();
    await expect.poll(async () => page.evaluate(async (userId) => {
      const request = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const count = await new Promise<number>((resolve, reject) => {
        const operationRequest = database.transaction("operations", "readonly").objectStore("operations").count();
        operationRequest.onsuccess = () => resolve(operationRequest.result);
        operationRequest.onerror = () => reject(operationRequest.error);
      });
      database.close();
      return count;
    }, president.userId), { timeout: 10_000 }).toBe(2);
    const operationIds = await page.evaluate(async (userId) => {
      const databaseRequest = indexedDB.open(`merendar-offline-${encodeURIComponent(userId)}`, 1);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        databaseRequest.onsuccess = () => resolve(databaseRequest.result);
        databaseRequest.onerror = () => reject(databaseRequest.error);
      });
      const operations = await new Promise<Array<{ operationId: string; dependencies: string[]; operation: string; resource: string; resourceId: string; createdAt: string; payload: { action?: string } }>>((resolve, reject) => {
        const request = database.transaction("operations", "readonly").objectStore("operations").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return operations
        .map((operation) => ({ operationId: operation.operationId, dependencies: operation.dependencies, operation: operation.operation, resource: operation.resource, resourceId: operation.resourceId, createdAt: operation.createdAt, payload: operation.payload }))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }, president.userId);
    expect(operationIds).toHaveLength(2);
    expect(operationIds[1]?.payload.action).toBe("add-member");
    await expect(page.getByText("Integrantes (2)", { exact: true })).toBeVisible();
    await expect(page.getByText("Pendiente de sincronización").first()).toBeVisible();
    expect(operationIds[1]?.dependencies).toContain(operationIds[0]?.operationId);

    await page.reload();
    await expect(page.getByText(familyName, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver ficha familiar" }).last()).toBeVisible();

    await context.setOffline(false);
    await expect.poll(async () => prisma.family.findFirst({ where: { name: familyName }, select: { id: true } }), { timeout: 30_000 }).not.toBeNull();
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId: { in: operationIds.map((operation) => operation.operationId) } } }), { timeout: 30_000 }).toBe(2);
    const syncedFamily = await prisma.family.findFirst({ where: { name: familyName }, include: { members: true } });
    expect(syncedFamily?.members).toHaveLength(2);
    await expect(page.getByText(familyName, { exact: true })).toBeVisible();
    expect(await prisma.synchronizationReceipt.count({ where: { operationId: { in: operationIds.map((operation) => operation.operationId) } } })).toBe(2);

    await context.setOffline(true);
    await context.setOffline(false);
    await expect.poll(async () => prisma.synchronizationReceipt.count({ where: { operationId: { in: operationIds.map((operation) => operation.operationId) } } }), { timeout: 10_000 }).toBe(2);
    const replayedFamily = await prisma.family.findFirst({ where: { name: familyName }, include: { members: true } });
    expect(replayedFamily?.members).toHaveLength(2);
    await captureBrowserEvidence(browser, page, testInfo);
  } finally {
    await context.setOffline(false);
    await removeBrowserFamily(familyName);
    await removeBrowserIdentity(president);
    await prisma.$disconnect();
  }
});
