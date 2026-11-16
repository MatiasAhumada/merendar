import "dotenv/config";
import { expect, test } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBrowserIdentity, removeBrowserIdentity, setBrowserIdentity } from "./browser-identity";

test("keeps primary actions and destructive controls consistent and accessible", async ({ context, page }) => {
  const identity = await createBrowserIdentity(UserRole.PRESIDENTE);

  try {
    await setBrowserIdentity(context, identity);

    const primaryActions = [
      { route: "/familias", name: "Nueva familia" },
      { route: "/usuarios", name: "Crear usuario" },
      { route: "/mercaderia", name: "Nuevo período" },
    ];
    const primaryStyles: Array<{ height: string; borderRadius: string }> = [];

    for (const action of primaryActions) {
      await page.goto(action.route);
      const primaryButton = page.getByRole("button", { name: action.name, exact: true });
      await expect(primaryButton).toBeVisible();
      await expect(primaryButton).toHaveAttribute("data-variant", "default");
      await expect(primaryButton).toHaveAttribute("data-size", "default");
      primaryStyles.push(await primaryButton.evaluate((button) => {
        const styles = window.getComputedStyle(button);
        return { height: styles.height, borderRadius: styles.borderRadius };
      }));
    }

    expect(primaryStyles[1]).toEqual(primaryStyles[0]);
    expect(primaryStyles[2]).toEqual(primaryStyles[0]);

    await page.goto("/entrega");
    await expect(page.getByRole("heading", { name: "Beneficiarios y planillas" })).toBeVisible();
    const unnamedButtons = await page.locator("button:visible").evaluateAll((buttons) => buttons
      .filter((button) => !button.getAttribute("aria-label") && !button.textContent?.trim())
      .length);
    expect(unnamedButtons).toBe(0);

    await page.goto("/usuarios");
    await expect(page.getByRole("status").filter({ hasText: /Vistas autorizadas listas/ })).toBeVisible({ timeout: 30_000 });
    const identityUser = await prisma.user.findUnique({ where: { id: identity.userId }, select: { email: true } });
    if (!identityUser?.email) {
      throw new Error("La identidad efímera no tiene un email de prueba.");
    }
    const browserIdentityRow = page.locator("ul.divide-y > li").filter({ hasText: identityUser.email });
    const destructiveButton = browserIdentityRow.getByRole("button", { name: "Eliminar", exact: true });
    await expect(destructiveButton).toHaveAttribute("data-variant", "destructive");
    const destructiveColors = await destructiveButton.evaluate((button) => {
      const tokenProbe = window.document.createElement("span");
      tokenProbe.style.color = "var(--destructive)";
      tokenProbe.style.backgroundColor = "var(--destructive-foreground)";
      window.document.body.append(tokenProbe);
      const tokenColor = window.getComputedStyle(tokenProbe).color;
      const tokenForeground = window.getComputedStyle(tokenProbe).backgroundColor;
      const buttonStyles = window.getComputedStyle(button);
      const buttonColors = { background: buttonStyles.backgroundColor, foreground: buttonStyles.color };
      tokenProbe.remove();
      return { tokenColor, tokenForeground, buttonColors };
    });
    expect(destructiveColors.buttonColors.background).toBe(destructiveColors.tokenColor);
    expect(destructiveColors.buttonColors.foreground).toBe(destructiveColors.tokenForeground);

    const passwordField = page.getByRole("textbox", { name: "Contraseña inicial" });
    const createUserButton = page.getByRole("button", { name: "Crear usuario", exact: true });
    await passwordField.focus();
    await page.keyboard.press("Tab");
    await expect(createUserButton).toBeFocused();
    const focusRing = await createUserButton.evaluate((button) => window.getComputedStyle(button).boxShadow);
    expect(focusRing).not.toBe("none");

    await context.setOffline(true);
    await expect(createUserButton).toBeDisabled();
    await context.setOffline(false);
    await expect(createUserButton).toBeEnabled();
  } finally {
    await context.setOffline(false);
    await removeBrowserIdentity(identity);
    await prisma.$disconnect();
  }
});
