import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { familyService } from "@/server/services/family.service";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity, type BrowserIdentity } from "./browser-identity";

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

      await expect(page.getByText("Resumen operativo no habilitado para este rol", { exact: true })).toHaveCount(access.operational ? 0 : 1);
      await expect(page.getByRole("link", { name: /Padrón familiar/ })).toHaveCount(access.operational ? 1 : 0);
    }

    await captureBrowserEvidence(browser, page, testInfo);
  } finally {
    await context.setOffline(false);
    await Promise.all(identities.map(removeBrowserIdentity));
    await prisma.$disconnect();
  }
});

test("prepares private views, keeps them available after network loss, and isolates a second account", async ({ browser, context, page }, testInfo) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  let secretary: BrowserIdentity | undefined;

  try {
    await setBrowserIdentity(context, president);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: `Hola, Browser ${UserRole.PRESIDENTE}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preparar offline" })).toBeEnabled();
    await page.getByRole("button", { name: "Preparar offline" }).click();
    await expect(page.getByText(/Vistas preparadas el/)).toBeVisible({ timeout: 30_000 });

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const privateCacheCheck = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const publicCache = await caches.open("merendar-public-v4");
      const cachedRequests = await publicCache.keys();
      return {
        cacheNames,
        privateApiCached: Boolean(await publicCache.match("/api/families")),
        privateRouteCached: Boolean(await publicCache.match("/familias")),
        cachedPaths: cachedRequests.map((request) => new URL(request.url).pathname),
      };
    });
    expect(privateCacheCheck.cacheNames).toEqual(["merendar-public-v4"]);
    expect(privateCacheCheck.privateApiCached).toBe(false);
    expect(privateCacheCheck.privateRouteCached).toBe(false);
    expect(privateCacheCheck.cachedPaths.some((path) => path.startsWith("/api/") || path === "/familias")).toBe(false);

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/offline\?route=%2Ffamilias/);
    await expect(page.getByRole("heading", { name: "Acceso sin conexión" })).toBeVisible();
    await expect(page.getByText("Ficha familiar preparada", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("Ficha familiar preparada", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);

    secretary = await createBrowserIdentity(UserRole.TESORERIA);
    await context.setOffline(false);
    await setBrowserIdentity(context, secretary);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: `Hola, Browser ${UserRole.TESORERIA}` })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Acceso sin conexión" })).toBeVisible();
    await expect(page.getByText("No hay una preparación vigente para esta cuenta", { exact: true })).toBeVisible();
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
        snapshot: { beneficiaries: [{ personId: personIdWithSheet }] },
      },
    });

    await setBrowserIdentity(context, president);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/familias");
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

test("creates a family and adds a member offline, then syncs the dependency chain once", async ({ browser, context, page }, testInfo) => {
  const president = await createBrowserIdentity(UserRole.PRESIDENTE);
  const familyName = `Browser Offline ${randomUUID()}`;

  try {
    await setBrowserIdentity(context, president);
    await page.goto("/");
    await page.getByRole("button", { name: "Preparar offline" }).click();
    await expect(page.getByText(/Vistas preparadas el/)).toBeVisible({ timeout: 30_000 });
    await page.evaluate(async () => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto("/familias");
    await expect(page).toHaveURL(/\/offline\?route=%2Ffamilias/);
    await expect(page.getByText("Ficha familiar preparada", { exact: true })).toBeVisible();
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
    await expect(page.getByText("1 integrante", { exact: true })).toBeVisible();

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
