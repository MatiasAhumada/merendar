import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { DELETE as deleteUser } from "@/app/api/users/[id]/route";
import { GET as getUsers } from "@/app/api/users/route";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { authService, hashPassword } from "@/server/services/auth.service";

const requestOrigin = "http://localhost:3000";
const sessionDuration = 60 * 60_000;

function assertDevelopmentDatabase() {
  assert.equal(process.env.ALLOW_USER_DELETION_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);
}

async function createAccount(role: UserRole, name: string, password?: string) {
  const suffix = randomBytes(8).toString("hex");
  let passwordHash: string | null = null;

  if (password) {
    passwordHash = await hashPassword(password);
  }

  return prisma.user.create({
    data: {
      email: `user-deletion-${suffix}@example.test`,
      username: `user-deletion-${suffix}`,
      name,
      role,
      isActive: true,
      passwordHash,
    },
  });
}

async function createSession(userId: string, expiresAt = new Date(Date.now() + sessionDuration)) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.authSession.create({ data: { userId, tokenHash, expiresAt } });
  return token;
}

function createDeleteRequest(userId: string, token: string, origin = requestOrigin) {
  return new NextRequest(`${requestOrigin}/api/users/${userId}`, {
    method: "DELETE",
    headers: {
      origin,
      host: "localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
      cookie: `${AUTH.SESSION_COOKIE}=${token}`,
    },
  });
}

async function cleanAccounts(userIds: string[]) {
  await prisma.family.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { deletedById: null } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

test("logical user deletion preserves historical authorship, revokes sessions and is idempotent", async () => {
  assertDevelopmentDatabase();
  const loginPassword = "clave-de-prueba";
  const actor = await createAccount(UserRole.PRESIDENTE, "President Test User");
  const target = await createAccount(UserRole.SECRETARIA, "Historical User", loginPassword);
  const actorToken = await createSession(actor.id);
  const targetToken = await createSession(target.id);
  const family = await prisma.family.create({
    data: { name: "Synthetic family", neighborhood: "Synthetic", address: "Synthetic", createdById: target.id },
  });

  try {
    const response = await deleteUser(createDeleteRequest(target.id, actorToken), { params: Promise.resolve({ id: target.id }) });
    assert.equal(response.status, 204);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);

    const deletedTarget = await prisma.user.findUnique({ where: { id: target.id } });
    assert.ok(deletedTarget?.deletedAt);
    assert.equal(deletedTarget?.deletedById, actor.id);
    assert.equal(deletedTarget?.isActive, false);
    assert.equal((await prisma.family.findUnique({ where: { id: family.id } }))?.createdById, target.id);
    assert.equal(await authService.getSession(targetToken), null);
    assert.deepEqual(await authService.login(target.username ?? "", loginPassword), { type: "invalid-credentials" });

    const retryResponse = await deleteUser(createDeleteRequest(target.id, actorToken), { params: Promise.resolve({ id: target.id }) });
    assert.equal(retryResponse.status, 204);

    const usersRequest = new NextRequest(`${requestOrigin}/api/users`, {
      headers: { cookie: `${AUTH.SESSION_COOKIE}=${actorToken}` },
    });
    const usersResponse = await getUsers(usersRequest);
    assert.equal(usersResponse.status, 200);
    const usersBody: unknown = await usersResponse.json();
    assert.equal(JSON.stringify(usersBody).includes(target.id), false);
  } finally {
    await cleanAccounts([actor.id, target.id]);
    await prisma.$disconnect();
  }
});

test("user deletion rejects non-presidents, cross-origin requests and self-deletion", async () => {
  assertDevelopmentDatabase();
  const actor = await createAccount(UserRole.PRESIDENTE, "President Guard User");
  const secretary = await createAccount(UserRole.SECRETARIA, "Secretary Guard User");
  const target = await createAccount(UserRole.VOCALIA, "Protected Target");
  const actorToken = await createSession(actor.id);
  const secretaryToken = await createSession(secretary.id);
  const expiredToken = await createSession(actor.id, new Date(Date.now() - 1_000));
  const userIds = [actor.id, secretary.id, target.id];

  try {
    const anonymousResponse = await deleteUser(createDeleteRequest(target.id, ""), { params: Promise.resolve({ id: target.id }) });
    assert.equal(anonymousResponse.status, 401);

    const expiredSessionResponse = await deleteUser(createDeleteRequest(target.id, expiredToken), { params: Promise.resolve({ id: target.id }) });
    assert.equal(expiredSessionResponse.status, 401);

    const unauthorizedResponse = await deleteUser(createDeleteRequest(target.id, secretaryToken), { params: Promise.resolve({ id: target.id }) });
    assert.equal(unauthorizedResponse.status, 403);

    const wrongOriginResponse = await deleteUser(createDeleteRequest(target.id, actorToken, "https://untrusted.invalid"), { params: Promise.resolve({ id: target.id }) });
    assert.equal(wrongOriginResponse.status, 403);

    const selfResponse = await deleteUser(createDeleteRequest(actor.id, actorToken), { params: Promise.resolve({ id: actor.id }) });
    assert.equal(selfResponse.status, 403);

    const missingUserResponse = await deleteUser(createDeleteRequest("missing-user", actorToken), { params: Promise.resolve({ id: "missing-user" }) });
    assert.equal(missingUserResponse.status, 404);

    const untouchedTarget = await prisma.user.findUnique({ where: { id: target.id } });
    assert.equal(untouchedTarget?.deletedAt, null);
  } finally {
    await cleanAccounts(userIds);
    await prisma.$disconnect();
  }
});

test("concurrent presidents cannot logically delete each other and remove the last active president", async () => {
  assertDevelopmentDatabase();
  const firstPresident = await createAccount(UserRole.PRESIDENTE, "Concurrent President One");
  const secondPresident = await createAccount(UserRole.PRESIDENTE, "Concurrent President Two");
  const firstToken = await createSession(firstPresident.id);
  const secondToken = await createSession(secondPresident.id);
  const userIds = [firstPresident.id, secondPresident.id];

  try {
    const activePresidentsBefore = await prisma.user.count({ where: { role: UserRole.PRESIDENTE, isActive: true, deletedAt: null } });
    const [firstResponse, secondResponse] = await Promise.all([
      deleteUser(createDeleteRequest(secondPresident.id, firstToken), { params: Promise.resolve({ id: secondPresident.id }) }),
      deleteUser(createDeleteRequest(firstPresident.id, secondToken), { params: Promise.resolve({ id: firstPresident.id }) }),
    ]);
    const activePresidents = await prisma.user.count({ where: { role: UserRole.PRESIDENTE, isActive: true, deletedAt: null } });
    const deletedPresidents = await prisma.user.count({ where: { id: { in: userIds }, deletedAt: { not: null } } });

    assert.equal(activePresidents, activePresidentsBefore - 1);
    assert.equal(deletedPresidents, 1);
    assert.equal([firstResponse.status, secondResponse.status].filter((status) => status === 204).length, 1);
  } finally {
    await cleanAccounts(userIds);
    await prisma.$disconnect();
  }
});
