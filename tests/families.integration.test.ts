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
import { POST as addFamilyMember } from "@/app/api/families/[id]/members/route";
import { PATCH as updateFamilyMember } from "@/app/api/families/[id]/members/[memberId]/route";
import { POST as synchronizeOperation } from "@/app/api/synchronizations/route";

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
    version: z.number(),
    members: z.array(z.object({
      id: z.string(),
      membershipId: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      dni: z.string().nullable(),
      missingDocuments: z.array(z.object({ id: z.string(), documentType: z.string() })),
    })),
  }),
});
const familyListSchema = z.object({ families: z.array(z.object({ id: z.string(), name: z.string(), members: z.array(z.object({ dni: z.string().nullable() })) })) });
const errorSchema = z.object({ error: z.object({ message: z.string(), details: z.record(z.string(), z.array(z.string())).optional() }) });
const synchronizationResponseSchema = z.object({
  operationId: z.uuid(),
  resourceVersion: z.number(),
  replayed: z.boolean(),
  result: z.object({ resourceId: z.string(), name: z.string() }),
});
const synchronizationErrorSchema = z.object({ error: z.object({ code: z.string() }) });

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
  const dnis = Array.from({ length: 7 }, () => `${10_000_000 + Number.parseInt(randomBytes(4).toString("hex"), 16) % 90_000_000}`);
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
    assert.equal(createdFamily.members.some((member) => member.dni === dnis[0]), true);

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

    const missingDniResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, {
      ...familyInput,
      operationId: randomUUID(),
      name: `Missing DNI ${suffix}`,
      members: [{ ...familyInput.members[0], dni: undefined, missingDocuments: [] }],
    }));
    assert.equal(missingDniResponse.status, 400);

    const missingContactResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, {
      ...familyInput,
      operationId: randomUUID(),
      name: `Missing Contact ${suffix}`,
      contactPhone: undefined,
      contactEmail: undefined,
    }));
    assert.equal(missingContactResponse.status, 400);

    const invalidPhoneResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, {
      ...familyInput,
      operationId: randomUUID(),
      name: `Invalid Phone ${suffix}`,
      contactPhone: "12345",
      contactEmail: `valid-contact-${suffix}@example.test`,
    }));
    assert.equal(invalidPhoneResponse.status, 400);

    const emailOnlyResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, {
      ...familyInput,
      operationId: randomUUID(),
      name: `Email Contact ${suffix}`,
      contactPhone: undefined,
      contactEmail: `only-email-${suffix}@example.test`,
      members: [{ ...familyInput.members[0], dni: dnis[4], missingDocuments: [] }],
    }));
    assert.equal(emailOnlyResponse.status, 201);

    const phoneOnlyResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, {
      ...familyInput,
      operationId: randomUUID(),
      name: `Phone Contact ${suffix}`,
      contactPhone: "381 555 0142",
      contactEmail: undefined,
      members: [{ ...familyInput.members[0], dni: dnis[6], missingDocuments: [] }],
    }));
    assert.equal(phoneOnlyResponse.status, 201);

    const changedResponse = await PATCH(createRequest(`http://localhost:3000/api/families/${createdFamily.id}`, "PATCH", presidentToken, {
      name: createdFamily.name,
      neighborhood: createdFamily.neighborhood,
      address: "Calle de prueba 84",
      contactPhone: createdFamily.contactPhone,
      contactEmail: createdFamily.contactEmail,
      baseVersion: createdFamily.version,
    }), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(changedResponse.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const staleResponse = await PATCH(createRequest(`http://localhost:3000/api/families/${createdFamily.id}`, "PATCH", presidentToken, {
      name: createdFamily.name,
      neighborhood: createdFamily.neighborhood,
      address: createdFamily.address,
      contactPhone: createdFamily.contactPhone,
      contactEmail: createdFamily.contactEmail,
      baseVersion: createdFamily.version,
    }), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(staleResponse.status, 409);

    const familyAfterHeaderUpdate = await prisma.family.findUniqueOrThrow({ where: { id: createdFamily.id }, select: { version: true, referencePersonId: true } });
    const addedMemberId = randomUUID();
    const addedPersonId = randomUUID();
    const addOperationId = randomUUID();
    const addMemberBody = {
      operationId: addOperationId,
      baseVersion: familyAfterHeaderUpdate.version,
      memberId: addedMemberId,
      personId: addedPersonId,
      member: { firstName: "Sol", lastName: "Prueba", dni: dnis[2], relationship: "Hermana o hermano", missingDocuments: ["PARTIDA_NACIMIENTO"] },
      referencePersonId: addedPersonId,
    };
    const addMemberResponse = await addFamilyMember(createRequest(`http://localhost:3000/api/families/${createdFamily.id}/members`, "POST", secretaryToken, addMemberBody), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(addMemberResponse.status, 201);
    const parsedAddedMember = createdFamilySchema.safeParse(await addMemberResponse.json());
    assert.equal(parsedAddedMember.success, true);

    if (!parsedAddedMember.success) {
      assert.fail("La ficha no devolvió el integrante agregado");
    }

    assert.equal(parsedAddedMember.data.family.members.length, 3);
    assert.equal(parsedAddedMember.data.family.version, familyAfterHeaderUpdate.version + 1);
    assert.equal(parsedAddedMember.data.family.referencePersonId, addedPersonId);
    assert.equal(parsedAddedMember.data.family.members.some((member) => member.membershipId === addedMemberId), true);

    const replayedAddMember = await addFamilyMember(createRequest(`http://localhost:3000/api/families/${createdFamily.id}/members`, "POST", secretaryToken, addMemberBody), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(replayedAddMember.status, 201);
    const replayedFamilyBody = createdFamilySchema.safeParse(await replayedAddMember.json());
    assert.equal(replayedFamilyBody.success, true);

    if (!replayedFamilyBody.success) {
      assert.fail("El reintento no devolvió el resultado idempotente");
    }

    assert.equal(replayedFamilyBody.data.family.members.length, 3);

    const duplicateMemberResponse = await addFamilyMember(createRequest(`http://localhost:3000/api/families/${createdFamily.id}/members`, "POST", presidentToken, {
      ...addMemberBody,
      operationId: randomUUID(),
      memberId: randomUUID(),
      personId: randomUUID(),
      member: { ...addMemberBody.member, firstName: "Duplicada", dni: dnis[0] },
    }), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(duplicateMemberResponse.status, 409);
    assert.equal(await prisma.family.findUniqueOrThrow({ where: { id: createdFamily.id }, select: { version: true } }).then((family) => family.version), familyAfterHeaderUpdate.version + 1);

    const missingDniMemberResponse = await addFamilyMember(createRequest(`http://localhost:3000/api/families/${createdFamily.id}/members`, "POST", presidentToken, {
      ...addMemberBody,
      operationId: randomUUID(),
      memberId: randomUUID(),
      personId: randomUUID(),
      member: { firstName: "Sin", lastName: "Documento", relationship: "Hija o hijo", missingDocuments: ["DNI"] },
    }), { params: Promise.resolve({ id: createdFamily.id }) });
    assert.equal(missingDniMemberResponse.status, 400);

    const updateMemberResponse = await updateFamilyMember(createRequest(`http://localhost:3000/api/families/${createdFamily.id}/members/${addedMemberId}`, "PATCH", presidentToken, {
      operationId: randomUUID(),
      baseVersion: familyAfterHeaderUpdate.version + 1,
      member: { firstName: "Sol corregida", lastName: "Prueba", dni: dnis[2], relationship: "Hermana o hermano", missingDocuments: [] },
      referencePersonId: createdFamily.members[0]?.id ?? "",
    }), { params: Promise.resolve({ id: createdFamily.id, memberId: addedMemberId }) });
    assert.equal(updateMemberResponse.status, 200);
    const parsedUpdatedFamily = createdFamilySchema.safeParse(await updateMemberResponse.json());
    assert.equal(parsedUpdatedFamily.success, true);

    if (!parsedUpdatedFamily.success) {
      assert.fail("La actualización no devolvió la ficha del integrante");
    }

    assert.equal(parsedUpdatedFamily.data.family.version, familyAfterHeaderUpdate.version + 2);
    assert.equal(parsedUpdatedFamily.data.family.referencePersonId, createdFamily.members[0]?.id);
    assert.equal(parsedUpdatedFamily.data.family.members.find((member) => member.membershipId === addedMemberId)?.firstName, "Sol corregida");

    const crossOriginResponse = await POST(createRequest("http://localhost:3000/api/families", "POST", presidentToken, familyInput, "https://untrusted.invalid"));
    assert.equal(crossOriginResponse.status, 403);

    const offlineFamilyId = randomUUID();
    const offlineOperation = {
      operationId: randomUUID(),
      userId: users[0].id,
      resource: "families",
      resourceId: offlineFamilyId,
      operation: "create",
      baseVersion: null,
      dependencies: [],
      payload: {
        name: `Offline Family ${suffix}`,
        neighborhood: "Villa Nueva",
        address: "Pasaje de prueba 12",
        contactPhone: "+54 9 381 555 0142",
        referenceMemberIndex: 0,
        members: [{ firstName: "Offline", lastName: "Prueba", dni: dnis[3], relationship: "Referente", missingDocuments: [] }],
      },
    };
    const synchronizedResponse = await synchronizeOperation(createRequest("http://localhost:3000/api/synchronizations", "POST", presidentToken, offlineOperation));
    assert.equal(synchronizedResponse.status, 200);
    assert.match(synchronizedResponse.headers.get("cache-control") ?? "", /no-store/);
    const parsedSynchronization = synchronizationResponseSchema.safeParse(await synchronizedResponse.json());
    assert.equal(parsedSynchronization.success, true);

    if (!parsedSynchronization.success) {
      assert.fail("La sincronización no confirmó el alta de la familia");
    }

    assert.equal(parsedSynchronization.data.result.resourceId, offlineFamilyId);
    assert.equal(parsedSynchronization.data.replayed, false);
    const replayedResponse = await synchronizeOperation(createRequest("http://localhost:3000/api/synchronizations", "POST", presidentToken, offlineOperation));
    const parsedReplay = synchronizationResponseSchema.safeParse(await replayedResponse.json());
    assert.equal(replayedResponse.status, 200);
    assert.equal(parsedReplay.success, true);

    if (!parsedReplay.success) {
      assert.fail("El reintento no devolvió el recibo original de la familia");
    }

    assert.equal(parsedReplay.data.replayed, true);
    assert.equal(await prisma.family.count({ where: { id: offlineFamilyId } }), 1);
    assert.equal(await prisma.person.count({ where: { dni: dnis[3] } }), 1);

    const legacyFamilyId = randomUUID();
    const legacyDraftOperation = {
      operationId: randomUUID(),
      userId: users[0].id,
      resource: "families",
      resourceId: legacyFamilyId,
      operation: "create",
      baseVersion: null,
      dependencies: [],
      payload: {
        name: `Legacy Draft ${suffix}`,
        neighborhood: "Villa Nueva",
        address: "Pasaje anterior 8",
        referenceMemberIndex: 0,
        members: [{ firstName: "Anterior", lastName: "Pendiente", relationship: "Referente", missingDocuments: [] }],
      },
    };
    const legacyDraftResponse = await synchronizeOperation(createRequest("http://localhost:3000/api/synchronizations", "POST", presidentToken, legacyDraftOperation));
    assert.equal(legacyDraftResponse.status, 200);
    assert.equal(await prisma.family.count({ where: { id: legacyFamilyId } }), 1);

    const offlineMemberId = randomUUID();
    const offlinePersonId = randomUUID();
    const offlineMemberOperation = {
      operationId: randomUUID(),
      userId: users[0].id,
      resource: "families",
      resourceId: offlineFamilyId,
      operation: "update",
      baseVersion: 1,
      dependencies: [offlineOperation.operationId],
      payload: {
        action: "add-member",
        memberId: offlineMemberId,
        personId: offlinePersonId,
        member: { firstName: "Operación", lastName: "Dependiente", dni: dnis[5], relationship: "Hija o hijo", missingDocuments: ["DNI"] },
        referencePersonId: offlinePersonId,
      },
    };
    const offlineMemberResponse = await synchronizeOperation(createRequest("http://localhost:3000/api/synchronizations", "POST", presidentToken, offlineMemberOperation));
    assert.equal(offlineMemberResponse.status, 200);
    const parsedOfflineMemberResponse = synchronizationResponseSchema.safeParse(await offlineMemberResponse.json());
    assert.equal(parsedOfflineMemberResponse.success, true);

    if (!parsedOfflineMemberResponse.success) {
      assert.fail("La sincronización no aplicó el integrante dependiente");
    }

    assert.equal(parsedOfflineMemberResponse.data.resourceVersion, 2);
    assert.equal(await prisma.familyMember.count({ where: { id: offlineMemberId, familyId: offlineFamilyId } }), 1);
    assert.equal(await prisma.person.count({ where: { id: offlinePersonId } }), 1);
    const replayedOfflineMemberResponse = await synchronizeOperation(createRequest("http://localhost:3000/api/synchronizations", "POST", presidentToken, offlineMemberOperation));
    const parsedOfflineMemberReplay = synchronizationResponseSchema.safeParse(await replayedOfflineMemberResponse.json());
    assert.equal(replayedOfflineMemberResponse.status, 200);
    assert.equal(parsedOfflineMemberReplay.success, true);

    if (!parsedOfflineMemberReplay.success) {
      assert.fail("El reintento del integrante dependiente no devolvió su recibo");
    }

    assert.equal(parsedOfflineMemberReplay.data.replayed, true);
    assert.equal(await prisma.familyMember.count({ where: { familyId: offlineFamilyId } }), 2);

    const duplicateOfflineOperation = {
      ...offlineOperation,
      operationId: randomUUID(),
      userId: users[1].id,
      resourceId: randomUUID(),
      payload: {
        ...offlineOperation.payload,
        name: `Offline Duplicate ${suffix}`,
        members: [{ firstName: "Different", lastName: "Persona", dni: dnis[0], relationship: "Referente", missingDocuments: [] }],
      },
    };
    const duplicateOfflineResponse = await synchronizeOperation(createRequest("http://localhost:3000/api/synchronizations", "POST", secretaryToken, duplicateOfflineOperation));
    const duplicateOfflineBody: unknown = await duplicateOfflineResponse.json();
    const parsedDuplicateOffline = synchronizationErrorSchema.safeParse(duplicateOfflineBody);
    assert.equal(duplicateOfflineResponse.status, 409);
    assert.equal(parsedDuplicateOffline.success, true);

    if (!parsedDuplicateOffline.success) {
      assert.fail("La colisión de DNI no incluyó un estado de conflicto");
    }

    assert.equal(parsedDuplicateOffline.data.error.code, "version_conflict");
    assert.equal(await prisma.family.count({ where: { name: `Offline Duplicate ${suffix}` } }), 0);

    const forbiddenSync = await synchronizeOperation(createRequest("http://localhost:3000/api/synchronizations", "POST", treasurerToken, {
      ...offlineOperation,
      operationId: randomUUID(),
      userId: users[2].id,
      resourceId: randomUUID(),
    }));
    assert.equal(forbiddenSync.status, 403);
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
