import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { DELETE, GET, POST } from "@/app/api/session/route";
import { authService, hashPassword } from "@/server/services/auth.service";

test("database sessions reject invalid credentials and support persistence, expiry, CSRF and revocation", async () => {
  assert.equal(process.env.ALLOW_AUTH_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(10).toString("hex");
  const email = `auth-test-${suffix}@example.test`;
  const username = `auth-test-${suffix}`;
  const normalizedEmail = email.toLowerCase();
  const normalizedUsername = username.toLowerCase();
  const attemptKeyFor = (candidate: string) => createHash("sha256").update(candidate.toLowerCase()).digest("hex");
  const password = "clave";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      name: "Integration Test User",
      passwordHash,
      role: UserRole.PRESIDENTE,
      isActive: true,
    },
  });
  const sessionHashes: string[] = [];
  const attemptKeys = [
    attemptKeyFor(normalizedEmail),
    attemptKeyFor(normalizedUsername),
    attemptKeyFor(`missing-${suffix}@example.test`),
    attemptKeyFor(`locked-${suffix}@example.test`),
  ];

  try {
    assert.deepEqual(await authService.login(username, "incorrecta"), { type: "invalid-credentials" });
    assert.deepEqual(await authService.login(`missing-${suffix}@example.test`, password), { type: "invalid-credentials" });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    assert.deepEqual(await authService.login(username, password), { type: "invalid-credentials" });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });

    const login = await authService.login(username.toUpperCase(), password);
    assert.equal(login.type, "authenticated");

    if (login.type !== "authenticated") {
      assert.fail("La autenticación válida no creó una sesión.");
    }

    const tokenHash = createHash("sha256").update(login.token).digest("hex");
    sessionHashes.push(tokenHash);
    const storedSession = await prisma.authSession.findUnique({ where: { tokenHash } });
    assert.ok(storedSession);
    assert.equal(storedSession.userId, user.id);
    assert.equal(storedSession.revokedAt, null);
    assert.equal((await authService.getSession(login.token))?.user.id, user.id);
    assert.equal(await authService.getSession(`${login.token.slice(0, -1)}0`), null);

    const expiringLogin = await authService.login(email.toUpperCase(), password);
    assert.equal(expiringLogin.type, "authenticated");

    if (expiringLogin.type !== "authenticated") {
      assert.fail("La segunda autenticación válida no creó una sesión.");
    }

    const expiringTokenHash = createHash("sha256").update(expiringLogin.token).digest("hex");
    sessionHashes.push(expiringTokenHash);
    await prisma.authSession.update({
      where: { tokenHash: expiringTokenHash },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    assert.equal(await authService.getSession(expiringLogin.token), null);

    const request = new NextRequest("http://localhost:3000/api/session", {
      method: "POST",
      headers: { origin: "https://untrusted.invalid" },
      body: JSON.stringify({ identifier: email, password }),
    });
    assert.equal((await POST(request)).status, 403);

    const loginRequest = new NextRequest("https://localhost:3000/api/session", {
      method: "POST",
      headers: { origin: "https://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ identifier: username, password }),
    });
    const loginResponse = await POST(loginRequest);
    assert.equal(loginResponse.status, 200);
    assert.match(loginResponse.headers.get("cache-control") ?? "", /no-store/);
    const cookie = loginResponse.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`^${AUTH.SESSION_COOKIE}=`));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Secure/i);
    const routeToken = cookie.split(";")[0]?.split("=")[1];
    assert.ok(routeToken);
    const routeTokenHash = createHash("sha256").update(routeToken).digest("hex");
    sessionHashes.push(routeTokenHash);

    const sessionRequest = new NextRequest("http://localhost:3000/api/session", {
      headers: { cookie: `${AUTH.SESSION_COOKIE}=${routeToken}` },
    });
    assert.equal((await GET(sessionRequest)).status, 200);

    const logoutRequest = new NextRequest("http://localhost:3000/api/session", {
      method: "DELETE",
      headers: { origin: "http://localhost:3000", cookie: `${AUTH.SESSION_COOKIE}=${routeToken}` },
    });
    const logoutResponse = await DELETE(logoutRequest);
    assert.equal(logoutResponse.status, 204);
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Expires=/i);
    assert.equal(await authService.getSession(routeToken), null);

    const lockedEmail = `locked-${suffix}@example.test`;

    for (let attempt = 0; attempt < AUTH.MAX_LOGIN_ATTEMPTS; attempt += 1) {
      assert.deepEqual(await authService.login(lockedEmail, password), { type: "invalid-credentials" });
    }

    assert.deepEqual(await authService.login(lockedEmail, password), { type: "rate-limited" });
  } finally {
    await prisma.authSession.deleteMany({ where: { tokenHash: { in: sessionHashes } } });
    await prisma.loginAttempt.deleteMany({ where: { candidateKey: { in: attemptKeys } } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
