import { familyPayloadSchema } from "@/validations/family.validation";
import type { SyncHandlerResult, SynchronizationHandler } from "@/interfaces/synchronization.interface";
import { familyMemberChangeSchema } from "@/validations/family.validation";
import { createHash } from "node:crypto";
import { z } from "zod";

export const familySynchronizationHandler: SynchronizationHandler = {
  async apply(transaction, operation): Promise<SyncHandlerResult> {
    const baseVersionValidation = z.null().safeParse(operation.baseVersion);

    if (operation.operation === "create") {
      if (!baseVersionValidation.success) {
        throw new Error("El alta de familia no tiene una versión base válida");
      }

      const parsedPayload = familyPayloadSchema.safeParse(operation.payload);

      if (!parsedPayload.success) {
        throw new Error("La operación familiar no tiene un formato válido");
      }

      const familyInput = parsedPayload.data;

      for (const member of familyInput.members) {
        if (!member.dni) {
          continue;
        }

        const existingPerson = await transaction.person.findUnique({
          where: { dni: member.dni },
          include: {
            memberships: {
              include: {
                family: { select: { id: true, name: true, neighborhood: true, address: true } },
              },
            },
          },
        });

        if (existingPerson) {
          return {
            type: "conflict",
            resourceVersion: 1,
            current: {
              kind: "duplicate_dni",
              person: {
                firstName: existingPerson.firstName,
                lastName: existingPerson.lastName,
                dni: existingPerson.dni,
                families: existingPerson.memberships.map((membership) => membership.family),
              },
            },
          };
        }
      }

      const createdPeople = await Promise.all(familyInput.members.map((member) => transaction.person.create({
        data: {
          id: member.personId,
          firstName: member.firstName,
          lastName: member.lastName,
          dni: member.dni,
          email: member.email,
          phone: member.phone,
        },
      })));
      const referencePerson = createdPeople[familyInput.referenceMemberIndex];

      if (!referencePerson) {
        throw new Error("La operación familiar no indica un referente válido");
      }

      const family = await transaction.family.create({
        data: {
          id: operation.resourceId,
          name: familyInput.name,
          neighborhood: familyInput.neighborhood,
          address: familyInput.address,
          contactPhone: familyInput.contactPhone,
          contactEmail: familyInput.contactEmail,
          referencePersonId: referencePerson.id,
          createdById: operation.userId,
          members: {
            create: familyInput.members.map((member, index) => {
              const person = createdPeople[index];

              if (!person) {
                throw new Error("La operación familiar contiene una persona incompleta");
              }

              return {
                id: member.membershipId,
                relationship: member.relationship,
                person: { connect: { id: person.id } },
                missingDocuments: {
                  create: member.missingDocuments.map((documentType) => ({ documentType })),
                },
              };
            }),
          },
        },
      });

      return { type: "synchronized", resourceVersion: family.version, result: { resourceId: family.id, name: family.name } };
    }

    if (operation.operation !== "update" || !z.number().int().nonnegative().safeParse(operation.baseVersion).success) {
      throw new Error("La operación familiar no está habilitada para sincronizar");
    }

    const parsedChange = familyMemberChangeSchema.safeParse(operation.payload);

    if (!parsedChange.success) {
      throw new Error("La operación de integrante no tiene un formato válido");
    }

    const memberChange = parsedChange.data;
    const requestHash = createHash("sha256").update(JSON.stringify({
      familyId: operation.resourceId,
      baseVersion: operation.baseVersion,
      ...memberChange,
    })).digest("hex");
    const previousMemberOperation = await transaction.familyOperation.findUnique({ where: { operationId: operation.operationId }, include: { family: true } });

    if (previousMemberOperation) {
      if (previousMemberOperation.actorId === operation.userId && previousMemberOperation.requestHash === requestHash) {
        return {
          type: "synchronized",
          resourceVersion: previousMemberOperation.family.version,
          result: { resourceId: previousMemberOperation.family.id, name: previousMemberOperation.family.name },
        };
      }

      return { type: "conflict", resourceVersion: previousMemberOperation.family.version, current: { kind: "operation_key_reused" } };
    }

    const family = await transaction.family.findUnique({ where: { id: operation.resourceId }, include: { members: true } });

    if (!family) {
      return { type: "conflict", resourceVersion: 0, current: { kind: "family_missing" } };
    }

    if (family.version !== operation.baseVersion) {
      return { type: "conflict", resourceVersion: family.version, current: { id: family.id, version: family.version, updatedAt: family.updatedAt.toISOString() } };
    }

    const currentMembershipIds = family.members.map((membership) => membership.personId);
    const referenceBelongsToFamily = currentMembershipIds.includes(memberChange.referencePersonId);
    const referenceIsNewMember = memberChange.action === "add-member" && memberChange.personId === memberChange.referencePersonId;

    if (!referenceBelongsToFamily && !referenceIsNewMember) {
      return { type: "conflict", resourceVersion: family.version, current: { kind: "reference_not_in_family" } };
    }

    if (memberChange.action === "add-member") {
      let duplicatePerson: { id: string } | null = null;

      if (memberChange.member.dni) {
        duplicatePerson = await transaction.person.findUnique({
          where: { dni: memberChange.member.dni },
          select: { id: true },
        });
      }

      if (duplicatePerson) {
        return { type: "conflict", resourceVersion: family.version, current: { kind: "duplicate_dni" } };
      }

      await transaction.person.create({
        data: {
          id: memberChange.personId,
          firstName: memberChange.member.firstName,
          lastName: memberChange.member.lastName,
          dni: memberChange.member.dni,
          email: memberChange.member.email,
          phone: memberChange.member.phone,
        },
      });

      const changedFamily = await transaction.family.update({
        where: { id: family.id, version: operation.baseVersion },
        data: {
          version: { increment: 1 },
          referencePersonId: memberChange.referencePersonId,
          members: {
            create: {
              id: memberChange.memberId,
              relationship: memberChange.member.relationship,
              person: { connect: { id: memberChange.personId } },
              missingDocuments: { create: memberChange.member.missingDocuments.map((documentType) => ({ documentType })) },
            },
          },
        },
      });

      await transaction.familyOperation.create({ data: { operationId: operation.operationId, actorId: operation.userId, familyId: family.id, requestHash } });

      return { type: "synchronized", resourceVersion: changedFamily.version, result: { resourceId: changedFamily.id, name: changedFamily.name } };
    }

    const membership = family.members.find((currentMembership) => currentMembership.id === memberChange.memberId);

    if (!membership) {
      return { type: "conflict", resourceVersion: family.version, current: { kind: "member_missing" } };
    }

    let duplicatePerson: { id: string } | null = null;

    if (memberChange.member.dni) {
      duplicatePerson = await transaction.person.findFirst({
        where: { dni: memberChange.member.dni, id: { not: membership.personId } },
        select: { id: true },
      });
    }

    if (duplicatePerson) {
      return { type: "conflict", resourceVersion: family.version, current: { kind: "duplicate_dni" } };
    }

    const changedFamily = await transaction.family.update({
      where: { id: family.id, version: operation.baseVersion },
      data: {
        version: { increment: 1 },
        referencePersonId: memberChange.referencePersonId,
        members: {
          update: {
            where: { id: memberChange.memberId },
            data: {
              relationship: memberChange.member.relationship,
              person: {
                update: {
                  firstName: memberChange.member.firstName,
                  lastName: memberChange.member.lastName,
                  dni: memberChange.member.dni,
                  email: memberChange.member.email,
                  phone: memberChange.member.phone,
                },
              },
              missingDocuments: {
                deleteMany: {},
                create: memberChange.member.missingDocuments.map((documentType) => ({ documentType })),
              },
            },
          },
        },
      },
    });

    await transaction.familyOperation.create({ data: { operationId: operation.operationId, actorId: operation.userId, familyId: family.id, requestHash } });

    return { type: "synchronized", resourceVersion: changedFamily.version, result: { resourceId: changedFamily.id, name: changedFamily.name } };
  },
};
