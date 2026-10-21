import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";
import { AccessCapability, UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessPolicyRepository } from "@/server/repository/access-policy.repository";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import { GET as getFamilies } from "@/app/api/families/route";
import { GET as getPrivateRenditionDocument } from "@/app/api/renditions/documents/[id]/route";
import { GET as getAccessPolicy } from "@/app/api/access-policy/route";

test("role policies deny by default, update existing sessions immediately and write audit history", async () => {
  assert.equal(process.env.ALLOW_ACCESS_POLICY_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(10).toString("hex");
  const actor = await prisma.user.create({
    data: { email: `policy-actor-${suffix}@example.test`, name: "Policy Test President", role: UserRole.PRESIDENTE },
  });
  const account = await prisma.user.create({
    data: { email: `policy-member-${suffix}@example.test`, name: "Policy Test Vocalia", role: UserRole.VOCALIA },
  });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.authSession.create({ data: { userId: account.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60_000) } });
  const baseline = await prisma.roleCapabilityPolicy.findMany({ where: { role: UserRole.VOCALIA } });

  try {
    assert.equal(await hasEffectiveCapability(UserRole.VOCALIA, "families.read"), false);
    assert.equal(await hasEffectiveCapability(UserRole.VOCALIA, "unknown.capability"), false);
    assert.equal(await hasEffectiveCapability(UserRole.VOCALIA, "users.manage"), false);

    const forbiddenRequest = new NextRequest("http://localhost/api/families", { headers: { cookie: `merendar_session=${token}` } });
    const deniedFamilies = await getFamilies(forbiddenRequest);
    assert.equal(deniedFamilies.status, 403);

    const adminRequest = new NextRequest("http://localhost/api/access-policy", { headers: { cookie: `merendar_session=${token}` } });
    const deniedPolicy = await getAccessPolicy(adminRequest);
    assert.equal(deniedPolicy.status, 403);

    const privateDocumentRequest = new NextRequest("http://localhost/api/renditions/documents/private-id", { headers: { cookie: `merendar_session=${token}` } });
    const deniedDocument = await getPrivateRenditionDocument(privateDocumentRequest, { params: Promise.resolve({ id: "private-id" }) });
    assert.equal(deniedDocument.status, 403);

    await accessPolicyRepository.saveRolePolicies(actor.id, Object.values(AccessCapability).map((capability) => ({
      role: UserRole.VOCALIA,
      capability,
      enabled: capability === AccessCapability.FAMILIES_READ,
    })));

    assert.equal(await hasEffectiveCapability(UserRole.VOCALIA, "families.read"), true);
    const allowedFamilies = await getFamilies(forbiddenRequest);
    assert.equal(allowedFamilies.status, 200);

    const policyChange = await prisma.accessPolicyChange.findFirst({
      where: { actorId: actor.id, role: UserRole.VOCALIA, capability: AccessCapability.FAMILIES_READ },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(policyChange?.previousValue, false);
    assert.equal(policyChange?.newValue, true);

    await accessPolicyRepository.saveRolePolicies(actor.id, Object.values(AccessCapability).map((capability) => ({
      role: UserRole.VOCALIA,
      capability,
      enabled: false,
    })));
    const revokedFamilies = await getFamilies(forbiddenRequest);
    assert.equal(revokedFamilies.status, 403);
  } finally {
    await prisma.accessPolicyChange.deleteMany({ where: { actorId: actor.id } });
    await prisma.$transaction(baseline.map((policy) => prisma.roleCapabilityPolicy.update({
      where: { role_capability: { role: policy.role, capability: policy.capability } },
      data: { enabled: policy.enabled },
    })));
    await prisma.authSession.deleteMany({ where: { userId: account.id } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, account.id] } } });
  }
});
