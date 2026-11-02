

import { OFFLINE_OPERATION_MESSAGES, SYNC_SERVER_MESSAGES } from "@/constants/offline.constant";
import { DELIVERY_ERROR_MESSAGES } from "@/constants/delivery.constant";
import { beneficiarySheetDraftSchema, distributionPreparationPayloadSchema, distributionRecordPayloadSchema } from "@/schemas/record.schema";
import { Prisma } from "@prisma/client";
import { lockFamilyRows } from "@/server/repository/record.repository";
import { nullableSchema } from "@/schemas/offline.schema";
import type { SynchronizationHandler } from "@/interfaces/synchronization.interface";
import type { JsonObject } from "@/types/json-value";

export class RecordSynchronizationError extends Error {
  readonly code: "period_not_found" | "beneficiary_not_in_roster" | "beneficiary_dni_missing";
  readonly status: 400 | 404;

  constructor(code: RecordSynchronizationError["code"], status: RecordSynchronizationError["status"], message: string) {
    super(message);
    this.name = "RecordSynchronizationError";
    this.code = code;
    this.status = status;
  }
}

export const recordSynchronizationHandler: SynchronizationHandler = {
  async apply(transaction, operation) {
    const validBaseVersion = nullableSchema.safeParse(operation.baseVersion);

    if (operation.operation !== "create" || !validBaseVersion.success) {
      throw new Error(DELIVERY_ERROR_MESSAGES.EL_REGISTRO_SOLO_PERMITE_ALTAS_NUEVAS);
    }

    const parsedSheetDraft = beneficiarySheetDraftSchema.safeParse(operation.payload);
    if (parsedSheetDraft.success && parsedSheetDraft.data.id === operation.resourceId) {
      const draft = parsedSheetDraft.data;
      const period = await transaction.merchandisePeriod.findUnique({ where: { id: draft.periodId }, select: { id: true, destination: true } });

      if (!period || period.destination !== "FAMILIES") {
        throw new RecordSynchronizationError("period_not_found", 404, SYNC_SERVER_MESSAGES.EL_PERIODO_YA_NO_ESTA_DISPONIBLE_CONECTATE_Y_ELEGI_OTRO_PERIODO_ANTES_DE_E);
      }

      const personIds = draft.beneficiaries.map((beneficiary) => beneficiary.personId);
      const existingMemberships = await transaction.familyMember.findMany({
        where: { personId: { in: personIds } },
        select: { familyId: true },
      });
      await lockFamilyRows(transaction, existingMemberships.map((membership) => membership.familyId));
      const memberships = await transaction.familyMember.findMany({
        where: { personId: { in: personIds }, deactivatedAt: null, family: { deactivatedAt: null } },
        select: { personId: true, person: { select: { dni: true } } },
      });

      if (personIds.some((personId) => !memberships.some((membership) => membership.personId === personId))) {
        throw new RecordSynchronizationError("beneficiary_not_in_roster", 400, SYNC_SERVER_MESSAGES.UNA_PERSONA_SELECCIONADA_YA_NO_PERTENECE_AL_PADRON_ACTUALIZA_LOS_DATOS_ANT);
      }

      const membershipWithoutDni = memberships.find((membership) => !/^\d{7,8}$/.test(membership.person.dni ?? ""));
      if (membershipWithoutDni) {
        const beneficiaryWithoutDni = draft.beneficiaries.find((beneficiary) => beneficiary.personId === membershipWithoutDni.personId);
        const beneficiaryName = beneficiaryWithoutDni?.name ?? OFFLINE_OPERATION_MESSAGES.UNA_PERSONA_SELECCIONADA;
        throw new RecordSynchronizationError("beneficiary_dni_missing", 400, `${beneficiaryName} no tiene un DNI válido registrado. Corregilo en Familias y volvé a emitir la planilla.`);
      }

      const version = await transaction.beneficiarySheet.count({ where: { periodId: draft.periodId } }) + 1;
      const createdAt = new Date().toISOString();
      const snapshot: Prisma.InputJsonValue = {
        period: draft.period,
        version,
        createdAt,
        beneficiaries: draft.beneficiaries,
      };
      const sheet = await transaction.beneficiarySheet.create({
        data: { id: draft.id, periodId: draft.periodId, version, snapshot, createdById: operation.userId },
        select: { id: true, version: true },
      });

      const result: JsonObject = { resourceId: sheet.id, localId: draft.id, version: sheet.version };
      return {
        type: "synchronized",
        resourceVersion: sheet.version,
        result,
      };
    }

    const parsedPreparation = distributionPreparationPayloadSchema.safeParse(operation.payload);
    if (parsedPreparation.success && parsedPreparation.data.id === operation.resourceId) {
      const preparation = parsedPreparation.data;
      const period = await transaction.merchandisePeriod.findFirst({ where: { id: preparation.periodId, status: "VIGENTE" }, select: { id: true, destination: true } });
      if (!period) {
        throw new RecordSynchronizationError("period_not_found", 404, SYNC_SERVER_MESSAGES.EL_PERIODO_YA_NO_ESTA_DISPONIBLE_CONECTATE_Y_ELEGI_OTRO_PERIODO_ANTES_DE_E);
      }

      if (period.destination === "FAMILIES") {
        if (!preparation.allocations.length || preparation.supplyAllocations.length) {
          throw new RecordSynchronizationError("period_not_found", 400, DELIVERY_ERROR_MESSAGES.DESTINO_NO_COINCIDE_CON_RECEPCIONES);
        }
        const sourceIds = [...new Set(preparation.allocations.map((allocation) => allocation.remittanceId))].sort();
        await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "MerchandiseRemittance" WHERE "id" IN (${Prisma.join(sourceIds)}) ORDER BY "id" FOR UPDATE`);
        for (const sourceId of sourceIds) {
          const source = await transaction.merchandiseRemittance.findFirst({ where: { id: sourceId, request: { periodId: preparation.periodId, period: { destination: "FAMILIES" } }, status: "VIGENTE" }, select: { receivedQuantity: true } });
          const newQuantity = preparation.allocations.filter((allocation) => allocation.remittanceId === sourceId).reduce((total, allocation) => total + allocation.moduleQuantity, 0);
          const allocationTotal = await transaction.distributionAllocation.aggregate({ where: { remittanceId: sourceId }, _sum: { moduleQuantity: true } });
          const alreadyAllocated = allocationTotal._sum.moduleQuantity ?? 0;
          if (!source || !Number.isInteger(source.receivedQuantity.toNumber()) || alreadyAllocated + newQuantity > source.receivedQuantity.toNumber()) {
            throw new RecordSynchronizationError("period_not_found", 400, DELIVERY_ERROR_MESSAGES.ASIGNACION_SUPERA_MODULOS_DISPONIBLES);
          }
        }

        const familyIds = [...new Set(preparation.allocations.map((allocation) => allocation.familyId))];
        const activeFamilies = await transaction.family.findMany({ where: { id: { in: familyIds }, deactivatedAt: null }, select: { id: true } });
        if (activeFamilies.length !== familyIds.length) {
          throw new RecordSynchronizationError("beneficiary_not_in_roster", 400, DELIVERY_ERROR_MESSAGES.LA_FAMILIA_SELECCIONADA_NO_ESTA_ACTIVA);
        }
      } else {
        if (preparation.allocations.length || !preparation.supplyAllocations.length) {
          throw new RecordSynchronizationError("period_not_found", 400, DELIVERY_ERROR_MESSAGES.DESTINO_NO_COINCIDE_CON_RECEPCIONES);
        }
        const receiptItemIds = preparation.supplyAllocations.map((allocation) => allocation.receiptItemId).sort();
        await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "MerchandiseReceiptItem" WHERE "id" IN (${Prisma.join(receiptItemIds)}) ORDER BY "id" FOR UPDATE`);
        for (const allocation of preparation.supplyAllocations) {
          const receipt = await transaction.merchandiseReceiptItem.findFirst({
            where: { id: allocation.receiptItemId, remittance: { status: "VIGENTE", request: { periodId: preparation.periodId, period: { destination: "MERENDERO" } } } },
            select: { receivedQuantity: true },
          });
          const assigned = await transaction.distributionSupplyAllocation.aggregate({ where: { receiptItemId: allocation.receiptItemId }, _sum: { quantity: true } });
          const alreadyAssigned = assigned._sum.quantity ?? new Prisma.Decimal(0);
          if (!receipt || alreadyAssigned.plus(allocation.quantity).greaterThan(receipt.receivedQuantity)) {
            throw new RecordSynchronizationError("period_not_found", 400, DELIVERY_ERROR_MESSAGES.ASIGNACION_SUPERA_INSUMOS_DISPONIBLES);
          }
        }
      }

      const event = await transaction.distributionEvent.create({
        data: {
          id: preparation.id,
          periodId: preparation.periodId,
          scheduledAt: new Date(`${preparation.scheduledAt}T00:00:00.000Z`),
          location: preparation.location,
          responsibleNames: preparation.responsibleNames,
          notes: preparation.notes,
          createdById: operation.userId,
          allocations: { create: preparation.allocations.map((allocation) => ({ ...allocation, createdById: operation.userId })) },
          supplyAllocations: { create: preparation.supplyAllocations.map((allocation) => ({ ...allocation, quantity: new Prisma.Decimal(allocation.quantity), createdById: operation.userId })) },
        },
        select: { id: true, allocations: { select: { id: true } } },
      });
      return { type: "synchronized", resourceVersion: 1, result: { resourceId: event.id, allocations: event.allocations.length } };
    }

    const parsedPayload = distributionRecordPayloadSchema.safeParse(operation.payload);

    if (!parsedPayload.success || parsedPayload.data.id !== operation.resourceId) {
      throw new Error(DELIVERY_ERROR_MESSAGES.EL_REGISTRO_NO_TIENE_UN_FORMATO_VALIDO);
    }

    const input = parsedPayload.data;
    const period = await transaction.merchandisePeriod.findUnique({ where: { id: input.periodId }, select: { id: true, destination: true } });
    await lockFamilyRows(transaction, [input.familyId]);
    const membership = await transaction.familyMember.findFirst({
      where: { familyId: input.familyId, personId: input.personId, deactivatedAt: null, family: { deactivatedAt: null } },
      include: { person: { select: { firstName: true, lastName: true, dni: true } }, family: { select: { name: true, address: true } } },
    });

    if (!period || period.destination !== "FAMILIES" || !membership) {
      throw new RecordSynchronizationError("beneficiary_not_in_roster", 400, SYNC_SERVER_MESSAGES.EL_PERIODO_O_BENEFICIARIO_YA_NO_ESTA_DISPONIBLE_EN_EL_PADRON);
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
