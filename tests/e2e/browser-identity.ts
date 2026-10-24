import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { type BrowserContext } from "@playwright/test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "merendar_session";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1_000;
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3022";

export interface BrowserIdentity {
  userId: string;
  sessionToken: string;
}

export async function createBrowserIdentity(role: UserRole): Promise<BrowserIdentity> {
  assert.equal(process.env.ALLOW_BROWSER_TESTS, "true", "Definí ALLOW_BROWSER_TESTS=true para crear usuarios browser descartables.");
  const configuredDatabaseUrl = process.env.DATABASE_URL;
  assert.ok(configuredDatabaseUrl, "DATABASE_URL es obligatoria para las pruebas de navegador.");
  const databaseUrl = new URL(configuredDatabaseUrl);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname), "Las pruebas browser requieren PostgreSQL local.");
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/, "Las pruebas browser solo usan una base dev, test o local.");

  const suffix = randomUUID();
  const sessionToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const user = await prisma.user.create({
    data: {
      email: `browser-${suffix}@example.test`,
      username: `browser-${suffix}`,
      name: `Browser ${role}`,
      role,
      isActive: true,
    },
  });

  try {
    await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });
  } catch (error) {
    await prisma.user.delete({ where: { id: user.id } });
    throw error;
  }

  return { userId: user.id, sessionToken };
}

export async function removeBrowserIdentity(identity: BrowserIdentity): Promise<void> {
  await prisma.user.deleteMany({ where: { id: identity.userId } });
}

export async function setBrowserIdentity(context: BrowserContext, identity: BrowserIdentity): Promise<void> {
  await context.addCookies([{
    name: SESSION_COOKIE,
    value: identity.sessionToken,
    url: BASE_URL,
    httpOnly: true,
    sameSite: "Lax",
  }]);
}
