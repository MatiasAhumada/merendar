import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity } from "./browser-identity";

test("presidency confirms logical user deletion and preserves the historical account", async ({ context, page }) => {
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);
  const suffix = randomUUID();
  const target = await prisma.user.create({
    data: {
      email: `logical-delete-${suffix}@example.test`,
      username: `logical-delete-${suffix}`,
      name: "Synthetic account for logical deletion",
      role: UserRole.SECRETARIA,
      isActive: true,
    },
  });

  try {
    await setBrowserIdentity(context, identity);
    await page.goto("/usuarios");
    await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });

    const targetRow = page.locator("li").filter({ hasText: target.name });
    const deleteButton = targetRow.getByRole("button", { name: "Eliminar", exact: true });
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toBeEnabled();
    await context.setOffline(true);
    await expect(deleteButton).toBeDisabled();
    await context.setOffline(false);
    await expect(deleteButton).toBeEnabled();

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(horizontalOverflow).toBe(false);
    await deleteButton.click();

    const confirmation = page.getByRole("dialog");
    await expect(confirmation.getByRole("heading", { name: "Eliminar cuenta" })).toBeVisible();
    await expect(confirmation.getByText(/Synthetic account for logical deletion/)).toBeVisible();
    await expect(confirmation.getByText(/Se conservarán la autoría y el historial/)).toBeVisible();
    await confirmation.getByRole("button", { name: "Eliminar", exact: true }).click();

    await expect(targetRow).toHaveCount(0);
    await expect(page.getByText("Cuenta dada de baja. Se conservaron la autoría y el historial.")).toBeVisible();
    const storedTarget = await prisma.user.findUnique({ where: { id: target.id } });
    expect(storedTarget?.deletedAt).toBeTruthy();
    expect(storedTarget?.isActive).toBe(false);
    expect(storedTarget?.deletedById).toBe(identity.userId);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Administración de usuarios" })).toBeVisible();
    await expect(page.getByText(target.name, { exact: true })).toHaveCount(0);
  } finally {
    await context.setOffline(false);
    await prisma.user.updateMany({ where: { id: target.id }, data: { deletedById: null } });
    await prisma.user.deleteMany({ where: { id: target.id } });
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
