import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function findRecordPeriods() {
  return prisma.merchandisePeriod.findMany({
    select: { id: true, label: true, agency: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: "desc" },
  });
}

export async function findDistributionRecords(periodId?: string) {
  let where: PrismaTypes.DistributionRecordWhereInput = {};

  if (periodId) {
    where = { periodId };
  }

  return prisma.distributionRecord.findMany({
    where,
    include: { familyMember: { include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } }, family: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function findBeneficiarySheets(periodId?: string) {
  let where: PrismaTypes.BeneficiarySheetWhereInput = {};

  if (periodId) {
    where = { periodId };
  }

  return prisma.beneficiarySheet.findMany({
    where,
    select: { id: true, periodId: true, version: true, createdAt: true },
    orderBy: { version: "desc" },
  });
}

export async function findBeneficiarySheet(id: string) {
  return prisma.beneficiarySheet.findUnique({
    where: { id },
    include: { period: { select: { label: true } } },
  });
}

export async function findMerchandisePeriod(transaction: PrismaTypes.TransactionClient, id: string) {
  return transaction.merchandisePeriod.findUnique({ where: { id } });
}

export async function findFamilyMemberships(transaction: PrismaTypes.TransactionClient, personIds: string[]) {
  return transaction.familyMember.findMany({
    where: { personId: { in: personIds } },
    select: { familyId: true },
  });
}

export async function lockFamilyRows(transaction: PrismaTypes.TransactionClient, familyIds: string[]) {
  const orderedFamilyIds = [...new Set(familyIds)].sort();

  if (!orderedFamilyIds.length) {
    return;
  }

  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Family"
    WHERE "id" IN (${Prisma.join(orderedFamilyIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

export async function findCurrentFamilyMemberships(transaction: PrismaTypes.TransactionClient, personIds: string[]) {
  return transaction.familyMember.findMany({
    where: { personId: { in: personIds }, deactivatedAt: null, family: { deactivatedAt: null } },
    include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } }, family: { select: { name: true, address: true, neighborhood: true } } },
    orderBy: [{ family: { name: "asc" } }, { person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
  });
}

export async function countBeneficiarySheets(transaction: PrismaTypes.TransactionClient, periodId: string) {
  return transaction.beneficiarySheet.count({ where: { periodId } });
}

export async function createBeneficiarySheet(transaction: PrismaTypes.TransactionClient, input: {
  periodId: string;
  version: number;
  snapshot: Prisma.InputJsonValue;
  createdById: string;
}) {
  return transaction.beneficiarySheet.create({
    data: input,
    select: { id: true, version: true, createdAt: true },
  });
}

export function createSerializableTransaction<T>(operation: (transaction: PrismaTypes.TransactionClient) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: "Serializable" });
}
