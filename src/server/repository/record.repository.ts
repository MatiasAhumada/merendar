import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RecordHistoryQuery } from "@/schemas/record-history.schema";

export async function findRecordPeriods() {
  return prisma.merchandisePeriod.findMany({
    select: { id: true, label: true, agency: true, destination: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: "desc" },
  });
}

export async function findMerenderoSupplyReceipts() {
  const receipts = await prisma.merchandiseReceiptItem.findMany({
    where: { remittance: { status: "VIGENTE", request: { period: { destination: "MERENDERO", status: "VIGENTE" } } } },
    select: {
      id: true, receivedQuantity: true,
      remittance: { select: { remittanceNumber: true, receivedAt: true, request: { select: { periodId: true, requestNumber: true, period: { select: { label: true } } } } } },
      quotaItem: { select: { requestItem: { select: { productName: true, presentation: true, unit: true } } } },
      distributionAllocations: { select: { quantity: true } },
    },
    orderBy: [{ remittance: { receivedAt: "desc" } }, { id: "asc" }],
  });
  return receipts.map((receipt) => {
    const receivedQuantity = receipt.receivedQuantity.toNumber();
    const assignedQuantity = receipt.distributionAllocations.reduce((total, allocation) => total + allocation.quantity.toNumber(), 0);
    return {
      id: receipt.id,
      periodId: receipt.remittance.request.periodId,
      periodLabel: receipt.remittance.request.period.label,
      requestNumber: receipt.remittance.request.requestNumber,
      remittanceNumber: receipt.remittance.remittanceNumber,
      receivedAt: receipt.remittance.receivedAt.toISOString(),
      productName: receipt.quotaItem.requestItem.productName,
      presentation: receipt.quotaItem.requestItem.presentation,
      unit: receipt.quotaItem.requestItem.unit,
      receivedQuantity,
      assignedQuantity,
      remainingQuantity: receivedQuantity - assignedQuantity,
    };
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

export async function findRecordHistory(filters: RecordHistoryQuery) {
  const dateFilter: PrismaTypes.DateTimeFilter = {};
  if (filters.from) dateFilter.gte = new Date(`${filters.from}T00:00:00.000Z`);
  if (filters.to) dateFilter.lte = new Date(`${filters.to}T23:59:59.999Z`);
  const recordWhere: PrismaTypes.DistributionRecordWhereInput = {
    familyDeliveryId: null,
  };
  const eventWhere: PrismaTypes.DistributionEventWhereInput = {
  };
  if (filters.periodId) {
    recordWhere.periodId = filters.periodId;
    eventWhere.periodId = filters.periodId;
  }
  if (filters.from || filters.to) {
    recordWhere.receivedAt = dateFilter;
    eventWhere.scheduledAt = dateFilter;
  }
  const participantWhere: PrismaTypes.DistributionParticipantWhereInput = {
    familyDelivery: { is: { event: { is: eventWhere } } },
  };
  const familyMatch: PrismaTypes.StringFilter = {};
  if (filters.family) {
    familyMatch.contains = filters.family;
    familyMatch.mode = "insensitive";
  }

  const legacyConditions: PrismaTypes.DistributionRecordWhereInput[] = [];
  const participantConditions: PrismaTypes.DistributionParticipantWhereInput[] = [];
  if (filters.family) {
    legacyConditions.push({ familyMember: { family: { name: familyMatch } } });
    participantConditions.push({ familyDelivery: { family: { name: familyMatch } } });
  }
  let queryTerms: string[] = [];
  if (filters.query) queryTerms = filters.query.split(/\s+/);
  for (const queryTerm of queryTerms) {
    const textMatch: PrismaTypes.StringFilter = { contains: queryTerm, mode: "insensitive" };
    legacyConditions.push({ OR: [
      { familyMember: { family: { name: textMatch } } },
      { familyMember: { person: { OR: [{ firstName: textMatch }, { lastName: textMatch }, { dni: textMatch }] } } },
    ] });
    participantConditions.push({ OR: [
      { familyDelivery: { family: { name: textMatch } } },
      { familyMember: { person: { OR: [{ firstName: textMatch }, { lastName: textMatch }, { dni: textMatch }] } } },
    ] });
  }
  if (legacyConditions.length) recordWhere.AND = legacyConditions;
  if (participantConditions.length) participantWhere.AND = participantConditions;

  const offset = (filters.page - 1) * filters.pageSize;
  const candidateLimit = Math.min(offset + filters.pageSize + 1, 5000);
  const [legacyRecords, participants, legacyCount, participantCount] = await Promise.all([
    prisma.distributionRecord.findMany({
      where: recordWhere,
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: candidateLimit,
      select: {
        id: true, periodId: true, receivedAt: true, moduleType: true, quantity: true,
        period: { select: { label: true } },
        familyMember: { select: { person: { select: { firstName: true, lastName: true, dni: true } }, family: { select: { id: true, name: true } } } },
      },
    }),
    prisma.distributionParticipant.findMany({
      where: participantWhere,
      orderBy: [{ familyDelivery: { event: { scheduledAt: "desc" } } }, { id: "desc" }],
      take: candidateLimit,
      select: {
        id: true,
        familyMember: { select: { person: { select: { firstName: true, lastName: true, dni: true } } } },
        familyDelivery: { select: {
          familyId: true, moduleQuantity: true, family: { select: { name: true } },
          event: { select: { scheduledAt: true, periodId: true, period: { select: { label: true } } } },
        } },
      },
    }),
    prisma.distributionRecord.count({ where: recordWhere }),
    prisma.distributionParticipant.count({ where: participantWhere }),
  ]);

  const rows = [
    ...legacyRecords.map((record) => ({
      id: `record-${record.id}`, periodId: record.periodId, periodLabel: record.period.label,
      familyId: record.familyMember.family.id, familyName: record.familyMember.family.name,
      personName: `${record.familyMember.person.firstName} ${record.familyMember.person.lastName}`,
      dni: record.familyMember.person.dni, receivedAt: record.receivedAt.toISOString().slice(0, 10),
      moduleType: record.moduleType, quantity: record.quantity, source: "individual" as const,
    })),
    ...participants.map((participant) => ({
      id: `participant-${participant.id}`, periodId: participant.familyDelivery.event.periodId,
      periodLabel: participant.familyDelivery.event.period.label, familyId: participant.familyDelivery.familyId,
      familyName: participant.familyDelivery.family.name,
      personName: `${participant.familyMember.person.firstName} ${participant.familyMember.person.lastName}`,
      dni: participant.familyMember.person.dni,
      receivedAt: participant.familyDelivery.event.scheduledAt.toISOString().slice(0, 10),
      moduleType: "Módulo familiar", quantity: participant.familyDelivery.moduleQuantity, source: "jornada" as const,
    })),
  ].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || right.id.localeCompare(left.id));

  return {
    records: rows.slice(offset, offset + filters.pageSize),
    total: legacyCount + participantCount,
    page: filters.page,
    pageSize: filters.pageSize,
    hasMore: offset + filters.pageSize < legacyCount + participantCount,
  };
}

export async function findModuleReceipts() {
  const remittances = await prisma.merchandiseRemittance.findMany({
    where: { status: "VIGENTE", request: { period: { destination: "FAMILIES", status: "VIGENTE" } } },
    select: { id: true, remittanceNumber: true, receivedAt: true, receivedQuantity: true, request: { select: { periodId: true, requestNumber: true, period: { select: { label: true } } } }, distributionAllocations: { select: { moduleQuantity: true } } },
    orderBy: [{ receivedAt: "desc" }, { remittanceNumber: "asc" }],
  });

  return remittances.map((remittance) => {
    const receivedQuantity = remittance.receivedQuantity.toNumber();
    const assignedQuantity = remittance.distributionAllocations.reduce((total, allocation) => total + allocation.moduleQuantity, 0);
    return {
      id: remittance.id,
      periodId: remittance.request.periodId,
      periodLabel: remittance.request.period.label,
      requestNumber: remittance.request.requestNumber,
      remittanceNumber: remittance.remittanceNumber,
      receivedAt: remittance.receivedAt.toISOString(),
      receivedQuantity,
      assignedQuantity,
      remainingQuantity: receivedQuantity - assignedQuantity,
    };
  });
}

export async function findDistributionEvents(periodId?: string) {
  let where: Prisma.DistributionEventWhereInput = {};
  if (periodId) {
    where = { periodId };
  }
  const events = await prisma.distributionEvent.findMany({
    where,
    select: {
      id: true, version: true, status: true, periodId: true, scheduledAt: true, location: true, responsibleNames: true, notes: true,
      familyDeliveries: { select: {
        id: true, familyId: true, moduleQuantity: true, family: { select: { name: true } },
        participants: { select: {
          id: true, familyMemberId: true, paperSignatureChecked: true, physicalDniChecked: true,
          familyMember: { select: { personId: true, person: { select: { firstName: true, lastName: true, dni: true } } } },
        }, orderBy: { createdAt: "asc" } },
      }, orderBy: { family: { name: "asc" } } },
      allocations: { select: { id: true, familyId: true, family: { select: { name: true } }, remittanceId: true, remittance: { select: { remittanceNumber: true } }, moduleQuantity: true, notes: true }, orderBy: [{ family: { name: "asc" } }, { remittance: { remittanceNumber: "asc" } }] },
      supplyAllocations: { select: { id: true, receiptItemId: true, receiptItem: { select: { quotaItem: { select: { requestItem: { select: { productName: true, presentation: true, unit: true } } } }, remittance: { select: { remittanceNumber: true } } } }, quantity: true, notes: true } },
    },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
  });

  return events.map((event) => ({
    ...event,
    familyDeliveries: event.familyDeliveries.map((delivery) => ({
      id: delivery.id,
      familyId: delivery.familyId,
      moduleQuantity: delivery.moduleQuantity,
      familyName: delivery.family.name,
      participants: delivery.participants.map((participant) => ({
        id: participant.id,
        familyMemberId: participant.familyMemberId,
        personId: participant.familyMember.personId,
        name: `${participant.familyMember.person.firstName} ${participant.familyMember.person.lastName}`,
        dni: participant.familyMember.person.dni,
        paperSignatureChecked: participant.paperSignatureChecked,
        physicalDniChecked: participant.physicalDniChecked,
      })),
    })),
    allocations: event.allocations.map((allocation) => ({
      id: allocation.id,
      familyId: allocation.familyId,
      familyName: allocation.family.name,
      remittanceId: allocation.remittanceId,
      remittanceNumber: allocation.remittance.remittanceNumber,
      moduleQuantity: allocation.moduleQuantity,
      notes: allocation.notes,
    })),
    supplyAllocations: event.supplyAllocations.map((allocation) => ({
      id: allocation.id,
      receiptItemId: allocation.receiptItemId,
      productName: allocation.receiptItem.quotaItem.requestItem.productName,
      presentation: allocation.receiptItem.quotaItem.requestItem.presentation,
      unit: allocation.receiptItem.quotaItem.requestItem.unit,
      remittanceNumber: allocation.receiptItem.remittance.remittanceNumber,
      quantity: allocation.quantity.toNumber(),
      notes: allocation.notes,
    })),
  }));
}

export async function findBeneficiarySheets(periodId?: string) {
  let where: PrismaTypes.BeneficiarySheetWhereInput = {};

  if (periodId) {
    where = { periodId };
  }

  return prisma.beneficiarySheet.findMany({
    where,
    select: { id: true, periodId: true, distributionEventId: true, version: true, createdAt: true },
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
  distributionEventId?: string;
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
