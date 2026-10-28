

import { FAMILY_ERROR_MESSAGES } from "@/constants/family.constant";
import { prisma } from "@/lib/prisma";
import { FamilyOperationAction, Prisma } from "@prisma/client";
import type { CreateFamilyInput, FindFamiliesOptions, UpdateFamilyInput } from "@/types/family";

export type FamilyDeactivationTarget = { kind: "family" } | { kind: "member"; memberId: string };
export type FamilyDeactivationResult =
  | { type: "deactivated"; family: FamilyWithMembers }
  | { type: "missing" }
  | { type: "missing-member" }
  | { type: "conflict" }
  | { type: "has-records" }
  | { type: "last-member" }
  | { type: "reference-member" };

async function hasBeneficiarySheetReference(transaction: Prisma.TransactionClient, personIds: string[]) {
  if (!personIds.length) {
    return false;
  }

  const matchingSheets = await transaction.beneficiarySheet.findMany({
    where: {
      OR: personIds.map((personId) => ({
        snapshot: { path: ["beneficiaries"], array_contains: [{ personId }] },
      })),
    },
    select: { id: true },
    take: 1,
  });

  return matchingSheets.length > 0;
}

export async function deactivateFamilyInTransaction(
  transaction: Prisma.TransactionClient,
  input: { familyId: string; target: FamilyDeactivationTarget; baseVersion: number; actorId: string; operationId: string; requestHash: string },
): Promise<FamilyDeactivationResult> {
  const target = input.target;
  await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Family" WHERE "id" = ${input.familyId} FOR UPDATE`);
  const previousOperation = await transaction.familyOperation.findUnique({
    where: { operationId: input.operationId },
    include: { family: { include: FAMILY_INCLUDE } },
  });

  if (previousOperation) {
    let expectedAction: FamilyOperationAction;

    if (target.kind === "family") {
      expectedAction = FamilyOperationAction.FAMILY_DEACTIVATED;
    } else {
      expectedAction = FamilyOperationAction.MEMBER_DEACTIVATED;
    }
    if (previousOperation.actorId !== input.actorId || previousOperation.requestHash !== input.requestHash || previousOperation.action !== expectedAction) {
      return { type: "conflict" };
    }

    return { type: "deactivated", family: previousOperation.family };
  }

  const family = await transaction.family.findFirst({
    where: { id: input.familyId, deactivatedAt: null },
    include: { members: { where: { deactivatedAt: null }, include: { person: true, missingDocuments: true } } },
  });

  if (!family) {
    return { type: "missing" };
  }

  if (family.version !== input.baseVersion) {
    return { type: "conflict" };
  }

  let targetMember: FamilyWithMembers["members"][number] | undefined;

  if (target.kind === "member") {
    targetMember = family.members.find((member) => member.id === target.memberId);
  }

  if (target.kind === "member" && !targetMember) {
    return { type: "missing-member" };
  }

  if (targetMember && family.members.length <= 1) {
    return { type: "last-member" };
  }

  if (targetMember && family.referencePersonId === targetMember.personId) {
    return { type: "reference-member" };
  }

  let affectedMembers = family.members;

  if (targetMember) {
    affectedMembers = [targetMember];
  }
  const affectedMemberIds = affectedMembers.map((member) => member.id);
  const affectedPersonIds = affectedMembers.map((member) => member.personId);
  const distributionRecord = await transaction.distributionRecord.findFirst({
    where: { familyMemberId: { in: affectedMemberIds } },
    select: { id: true },
  });
  const hasSheetReference = await hasBeneficiarySheetReference(transaction, affectedPersonIds);

  if (distributionRecord || hasSheetReference) {
    return { type: "has-records" };
  }

  const deactivatedAt = new Date();
  const familyUpdate = await transaction.family.updateMany({
    where: { id: family.id, version: input.baseVersion, deactivatedAt: null },
    data: { version: { increment: 1 }, updatedAt: deactivatedAt },
  });

  if (!familyUpdate.count) {
    return { type: "conflict" };
  }

  if (target.kind === "family") {
    await transaction.family.update({
      where: { id: family.id },
      data: { deactivatedAt, deactivatedById: input.actorId },
    });
    await transaction.familyMember.updateMany({
      where: { familyId: family.id, deactivatedAt: null },
      data: { deactivatedAt, deactivatedById: input.actorId },
    });
  } else if (targetMember) {
    await transaction.familyMember.update({
      where: { id: targetMember.id },
      data: { deactivatedAt, deactivatedById: input.actorId },
    });
  }

  let action: FamilyOperationAction;

  if (target.kind === "family") {
    action = FamilyOperationAction.FAMILY_DEACTIVATED;
  } else {
    action = FamilyOperationAction.MEMBER_DEACTIVATED;
  }

  await transaction.familyOperation.create({
    data: {
      operationId: input.operationId,
      actorId: input.actorId,
      familyId: family.id,
      requestHash: input.requestHash,
      action,
    },
  });

  const updatedFamily = await transaction.family.findUniqueOrThrow({ where: { id: family.id }, include: FAMILY_INCLUDE });
  return { type: "deactivated", family: updatedFamily };
}

export const FAMILY_INCLUDE = {
  members: {
    where: { deactivatedAt: null },
    include: {
      person: true,
      missingDocuments: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

export type FamilyWithMembers = Prisma.FamilyGetPayload<{
  include: {
    members: {
      include: { person: true; missingDocuments: true };
      orderBy: { createdAt: "asc" };
    };
  };
}>;

export const familyRepository = {
  async findAll(options: FindFamiliesOptions) {
    const filters: Prisma.FamilyWhereInput[] = [];

    if (options.search) {
      filters.push({
        OR: [
          { name: { contains: options.search, mode: "insensitive" as const } },
          { neighborhood: { contains: options.search, mode: "insensitive" as const } },
          { address: { contains: options.search, mode: "insensitive" as const } },
          { contactPhone: { contains: options.search } },
          { contactEmail: { contains: options.search, mode: "insensitive" as const } },
          {
            members: {
              some: {
                person: {
                  OR: [
                    { firstName: { contains: options.search, mode: "insensitive" as const } },
                    { lastName: { contains: options.search, mode: "insensitive" as const } },
                    { dni: { contains: options.search } },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    if (options.neighborhood) {
      filters.push({ neighborhood: options.neighborhood });
    }

    if (options.alertsOnly) {
      filters.push({ members: { some: { missingDocuments: { some: {} } } } });
    }

    return prisma.family.findMany({
      where: { AND: [...filters, { deactivatedAt: null }] },
      include: FAMILY_INCLUDE,
      orderBy: [{ neighborhood: "asc" }, { name: "asc" }],
    });
  },

  async findById(id: string) {
    return prisma.family.findFirst({ where: { id, deactivatedAt: null }, include: FAMILY_INCLUDE });
  },

  async findOperation(operationId: string) {
    return prisma.familyOperation.findUnique({ where: { operationId }, include: { family: { include: FAMILY_INCLUDE } } });
  },

  async deactivate(input: { familyId: string; target: FamilyDeactivationTarget; baseVersion: number; actorId: string; operationId: string; requestHash: string }) {
    return prisma.$transaction(
      (transaction) => deactivateFamilyInTransaction(transaction, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },

  async findPersonByDni(dni: string) {
    return prisma.person.findUnique({ where: { dni }, select: { id: true } });
  },

  async create(input: CreateFamilyInput, createdById: string, operationId: string, requestHash: string) {
    return prisma.$transaction(async (transaction) => {
      const people = await Promise.all(input.members.map(async (member) => ({
        input: member,
        person: await transaction.person.create({
          data: {
            id: member.personId,
            firstName: member.firstName,
            lastName: member.lastName,
            dni: member.dni,
            email: member.email,
            phone: member.phone,
          },
        }),
      })));
      const referenceMember = people[input.referenceMemberIndex];

      if (!referenceMember) {
        throw new Error(FAMILY_ERROR_MESSAGES.EL_INTEGRANTE_REFERENTE_NO_EXISTE_EN_LA_SOLICITUD);
      }

      const family = await transaction.family.create({
        data: {
          name: input.name,
          neighborhood: input.neighborhood,
          address: input.address,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          referencePersonId: referenceMember.person.id,
          createdById,
          members: {
            create: people.map(({ input: member, person }) => ({
              id: member.membershipId,
              relationship: member.relationship,
              person: { connect: { id: person.id } },
              missingDocuments: {
                create: member.missingDocuments.map((documentType) => ({ documentType })),
              },
            })),
          },
        },
        include: FAMILY_INCLUDE,
      });

      await transaction.familyOperation.create({
        data: { operationId, actorId: createdById, familyId: family.id, requestHash },
      });

      return family;
    });
  },

  async update(id: string, input: UpdateFamilyInput) {
    return prisma.family.updateMany({
      where: { id, version: input.baseVersion, deactivatedAt: null },
      data: {
        name: input.name,
        neighborhood: input.neighborhood,
        address: input.address,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        version: { increment: 1 },
      },
    });
  },

  async applyMemberChange(
    familyId: string,
    baseVersion: number,
    actorId: string,
    operationId: string,
    requestHash: string,
    input: import("@/types/family").FamilyMemberChangeInput,
  ) {
    return prisma.$transaction(async (transaction) => {
      const existingFamily = await transaction.family.findUnique({ where: { id: familyId }, include: FAMILY_INCLUDE });

      if (!existingFamily) {
        return { type: "missing" as const };
      }

      if (existingFamily.version !== baseVersion) {
        return { type: "conflict" as const, family: existingFamily };
      }

      let existingPersonId: string | null = null;

      if (input.action === "update-member") {
        const membership = await transaction.familyMember.findFirst({
        where: { id: input.memberId, familyId, deactivatedAt: null },
          select: { personId: true },
        });

        if (!membership) {
          return { type: "missing-member" as const };
        }

        existingPersonId = membership.personId;
        let duplicatePerson: { id: string } | null = null;

        if (input.member.dni) {
          duplicatePerson = await transaction.person.findFirst({
            where: { dni: input.member.dni, id: { not: membership.personId } },
            select: { id: true },
          });
        }

        if (duplicatePerson) {
          return { type: "duplicate-dni" as const };
        }
      }

      const familyUpdateData: Prisma.FamilyUncheckedUpdateManyInput = { version: { increment: 1 } };

      if (input.action === "update-member" || input.referencePersonId !== input.personId) {
        familyUpdateData.referencePersonId = input.referencePersonId;
      } else if (existingFamily.referencePersonId) {
        familyUpdateData.referencePersonId = existingFamily.referencePersonId;
      }

      const versionUpdate = await transaction.family.updateMany({
        where: { id: familyId, version: baseVersion },
        data: familyUpdateData,
      });

      if (!versionUpdate.count) {
        const currentFamily = await transaction.family.findUnique({ where: { id: familyId }, include: FAMILY_INCLUDE });

        if (!currentFamily) {
          return { type: "missing" as const };
        }

        return { type: "conflict" as const, family: currentFamily };
      }

      if (input.action === "add-member") {
        await transaction.person.create({
          data: {
            id: input.personId,
            firstName: input.member.firstName,
            lastName: input.member.lastName,
            dni: input.member.dni,
            email: input.member.email,
            phone: input.member.phone,
            memberships: {
              create: {
                id: input.memberId,
                familyId,
                relationship: input.member.relationship,
                missingDocuments: { create: input.member.missingDocuments.map((documentType) => ({ documentType })) },
              },
            },
          },
        });

        if (input.referencePersonId === input.personId) {
          await transaction.family.update({ where: { id: familyId }, data: { referencePersonId: input.personId } });
        }
      } else {
        if (!existingPersonId) {
          throw new Error(FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_PERSONA_INTEGRANTE_ASOCIADA);
        }

        await transaction.person.update({
          where: { id: existingPersonId },
          data: {
            firstName: input.member.firstName,
            lastName: input.member.lastName,
            dni: input.member.dni,
            email: input.member.email,
            phone: input.member.phone,
          },
        });
        await transaction.familyMember.update({
          where: { id: input.memberId },
          data: {
            relationship: input.member.relationship,
            missingDocuments: {
              deleteMany: {},
              create: input.member.missingDocuments.map((documentType) => ({ documentType })),
            },
          },
        });
      }

      await transaction.familyOperation.create({
        data: { operationId, actorId, familyId, requestHash },
      });

      const family = await transaction.family.findUnique({ where: { id: familyId }, include: FAMILY_INCLUDE });

      if (!family) {
        return { type: "missing" as const };
      }

      return { type: "updated" as const, family };
    }, { isolationLevel: "Serializable" });
  },
};
