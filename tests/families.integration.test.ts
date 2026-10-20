import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/families/route";
import { PATCH } from "@/app/api/families/[id]/route";

const createdFamilySchema = z.object({
  family: z.object({
    id: z.string(),
    name: z.string(),
    neighborhood: z.string(),
    address: z.string(),
    contactPhone: z.string().nullable(),
    contactEmail: z.string().nullable(),
    referencePersonId: z.string().nullable(),
    updatedAt: z.string(),
    members: z.array(z.object({
      person: z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), dni: z.string().nullable() }),
      missingDocuments: z.array(z.object({ id: z.string(), documentType: z.string() })),
    })),
  }),
});
const familyListSchema = z.object({ families: z.array(z.object({ id: z.string(), name: z.string(), members: z.array(z.object({ person: z.object({ dni: z.string().nullable() }) })) })) });
const errorSchema = z.object({ error: z.object({ message: z.string(), details: z.record(z.string(), z.array(z.string())).optional() }) });

function createRequest(url: string, method: string, token: string, body?: unknown, origin = "http://localhost:3000") {
  const headers = new Headers({ origin, host: "localhost:3000", cookie: `merendar_session=${token}` });

  if (body) {
    headers.set("content-type", "application/json");
  }

  return new NextRequest(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

test("family registry persists records, rejects duplicate identities and enforces access by role", async () => {
  assert.equal(process.env.ALLOW_FAMILY_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(10).toString("hex");
  const userIds: string[] = [];
  const sessionTokens: string[] = [];
  const dnis = [`${(10_000_000 + Number.parseInt(suffix.slice(0, 7), 16) % 90_000_000).toString()}`, `${(10_000_000 + Number.parseInt(suffix.slice(7, 14), 16) % 90_000_000).toString()}`];
  const users = await Promise.all([
    prisma.user.create({ data: { email: `family-president-${suffix}@example.test`, username: `family-president-${suffix}`, name: "Family Test President", role: UserRole.PRESIDENTE } }),
    prisma.user.create({ data: { email: `family-secretary-${suffix}@example.test`, username: `family-secretary-${suffix}`, name: "Family Test Secretary", role: UserRole.SECRETARIA } }),
    prisma.user.create({ data: { email: `family-treasurer-${suffix}@example.test`, username: `family-treasurer-${suffix}`, name: "Family Test Treasurer", role: UserRole.TESORERIA } }),
  ]);
  userIds.push(...users.map((user) => user.id));

  const createSessionToken = async (userId: string) => {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    sessionTokens.push(tokenHash);
    await prisma.authSession.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + 60_000) } });
    return token;
  };

  const presidentToken = await createSessionToken(users[0].id);
  const secretaryToken = await createSessionToken(users[1].id);
  const treasurerToken = await createSessionToken(users[2].id);

  try {
    assert.equal((await GET(new NextRequest("http://localhost:3000/api/families"))).status, 401);
    assert.equal((await GET(createRequest("http://localhost:3000/api/families", "GET", treasurerToken))).status, 403);
    assert.equal((await POST(createRequest("http://localhost:3000/api/families", "POST", treasurerToken, {}))).status, 403);

    const familyInput = {
      operationId: randomUUID(),
      name: `Family Test ${suffix}`,
      neighborhood: "Villa Nueva",
      address: "Calle de prueba 42",
      contactPhone: "381 555 0142",
      contactEmail: `FAMILY-${suffix}@EXAMPLE.TEST`,
      referenceMemberIndex: 0,
      members: [
        { firstName: "Lucía", lastName: "Prueba", dni: dnis[0], email: `PERSON-${suffix}@EXAMPLE.TEST`, relationship: "Referente", missingDocuments: [] },
        { firstName: "Mateo", lastName: "Prueba", dni: dnis[1], relationship: "Hija o hijo", missingDocuments: ["DNI"] },
      ],
    };
    const createResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, familyInput));
    assert.equal(createResponse.status, 201);
    assert.match(createResponse.headers.get("cache-control") ?? "", /no-store/);
    const parsedCreate = createdFamilySchema.safeParse(await createResponse.json());
    assert.equal(parsedCreate.success, true);

    if (!parsedCreate.success) {
      assert.fail("La respuesta de alta no incluyó la ficha creada");
    }

    const createdFamily = parsedCreate.data.family;
    assert.equal(createdFamily.contactEmail, `family-${suffix}@example.test`);
    assert.equal(createdFamily.members.length, 2);
    assert.equal(createdFamily.members.reduce((total, member) => total + member.missingDocuments.length, 0), 1);
    assert.equal(createdFamily.members.some((member) => member.person.dni === dnis[0]), true);

    const retriedResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, familyInput));
    const parsedRetry = createdFamilySchema.safeParse(await retriedResponse.json());
    assert.equal(retriedResponse.status, 201);
    assert.equal(parsedRetry.success, true);

    if (!parsedRetry.success) {
      assert.fail("El reintento idempotente no devolvió la ficha original");
    }

    assert.equal(parsedRetry.data.family.id, createdFamily.id);

    const listResponse = await GET(createRequest(`http://localhost:3000/api/families?search=${dnis[0]}`, "GET", secretaryToken));
    assert.equal(listResponse.status, 200);
    const parsedList = familyListSchema.safeParse(await listResponse.json());
    assert.equal(parsedList.success, true);

    if (!parsedList.success) {
      assert.fail("La búsqueda no devolvió las fichas persistidas");
    }

    assert.equal(parsedList.data.families.length, 1);
    assert.equal(parsedList.data.families[0]?.name, familyInput.name);

    const duplicateResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", secretaryToken, {
      ...familyInput,
      operationId: randomUUID(),
      name: `Duplicate Test ${suffix}`,
      members: [{ ...familyInput.members[0], missingDocuments: [] }],
    }));
    assert.equal(duplicateResponse.status, 409);

    const invalidResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, {
      ...familyInput,
      operationId: randomUUID(),
      members: [{ ...familyInput.members[0], dni: "123" }],
    }));
    assert.equal(invalidResponse.status, 400);
    const parsedInvalid = errorSchema.safeParse(await invalidResponse.json());
    assert.equal(parsedInvalid.success, true);

    const changedResponse = await PATCH(createRequest(`http://localhost:3000/api/families/${createdFamily.id}`, "PATCH", presidentToken, {
      name: createdFamily.name,
      neighborhood: createdFamily.neighborhood,
      address: "Calle de prueba 84",
      contactPhone: createdFamily.contactPhone,
      contactEmail: createdFamily.contactEmail,
      baseUpdatedAt: createdFamily.updatedAt,
    }), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(changedResponse.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const staleResponse = await PATCH(createRequest(`http://localhost:3000/api/families/${createdFamily.id}`, "PATCH", presidentToken, {
      name: createdFamily.name,
      neighborhood: createdFamily.neighborhood,
      address: createdFamily.address,
      contactPhone: createdFamily.contactPhone,
      contactEmail: createdFamily.contactEmail,
      baseUpdatedAt: createdFamily.updatedAt,
    }), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(staleResponse.status, 409);

    const crossOriginResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, familyInput, "https://untrusted.invalid"));
    assert.equal(crossOriginResponse.status, 403);
  } finally {
    const familyRecords = await prisma.family.findMany({ where: { createdById: { in: userIds } }, select: { members: { select: { personId: true } } } });
    const personIds = [...new Set(familyRecords.flatMap((family) => family.members.map((member) => member.personId)))];
    await prisma.family.deleteMany({ where: { createdById: { in: userIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
    await prisma.authSession.deleteMany({ where: { tokenHash: { in: sessionTokens } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
