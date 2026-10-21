import { UserRole } from "@prisma/client";
import { distributionRecordPayloadSchema } from "@/validations/record.validation";
import type { SynchronizationHandler } from "@/interfaces/synchronization.interface";
import { z } from "zod";

export const recordSynchronizationHandler: SynchronizationHandler = {
  allowedRoles: [UserRole.PRESIDENTE, UserRole.SECRETARIA],

  async apply(transaction, operation) {
    const validBaseVersion = z.null().safeParse(operation.baseVersion);

    if (operation.operation !== "create" || !validBaseVersion.success) {
      throw new Error("El registro solo permite altas nuevas");
    }

    const parsedPayload = distributionRecordPayloadSchema.safeParse(operation.payload);

    if (!parsedPayload.success || parsedPayload.data.id !== operation.resourceId) {
      throw new Error("El registro no tiene un formato válido");
    }

    const input = parsedPayload.data;
    const period = await transaction.merchandisePeriod.findUnique({ where: { id: input.periodId }, select: { id: true } });
    const membership = await transaction.familyMember.findFirst({
      where: { familyId: input.familyId, personId: input.personId },
      include: { person: { select: { firstName: true, lastName: true, dni: true } }, family: { select: { name: true, address: true } } },
    });

    if (!period || !membership) {
      throw new Error("El período o beneficiario ya no está disponible en el padrón");
    }

    const duplicate = await transaction.distributionRecord.findUnique({
      where: { periodId_familyMemberId: { periodId: input.periodId, familyMemberId: membership.id } },
    });

    if (duplicate) {
      return {
        type: "conflict",
        resourceVersion: 1,
        current: { kind: "already-recorded", resourceId: duplicate.id, receivedAt: duplicate.receivedAt.toISOString() },
      };
    }

    const record = await transaction.distributionRecord.create({
      data: {
        id: input.id,
        operationId: operation.operationId,
        periodId: input.periodId,
        familyMemberId: membership.id,
        receivedAt: new Date(`${input.receivedAt}T00:00:00.000Z`),
        moduleType: input.moduleType,
        quantity: input.quantity,
        physicalDniChecked: input.physicalDniChecked,
        documentsChecked: input.documentsChecked,
        notes: input.notes,
        createdById: operation.userId,
      },
    });

    return {
      type: "synchronized",
      resourceVersion: 1,
      result: { resourceId: record.id, personId: membership.personId, familyName: membership.family.name },
    };
  },
};
