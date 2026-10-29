

import { OFFLINE_OPERATION_MESSAGES, SYNC_SERVER_MESSAGES } from "@/constants/offline.constant";
import { DELIVERY_ERROR_MESSAGES } from "@/constants/delivery.constant";
import { beneficiarySheetDraftSchema, distributionRecordPayloadSchema } from "@/schemas/record.schema";
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
      const period = await transaction.merchandisePeriod.findUnique({ where: { id: draft.periodId }, select: { id: true } });

      if (!period) {
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

    const parsedPayload = distributionRecordPayloadSchema.safeParse(operation.payload);

    if (!parsedPayload.success || parsedPayload.data.id !== operation.resourceId) {
      throw new Error(DELIVERY_ERROR_MESSAGES.EL_REGISTRO_NO_TIENE_UN_FORMATO_VALIDO);
    }

    const input = parsedPayload.data;
    const period = await transaction.merchandisePeriod.findUnique({ where: { id: input.periodId }, select: { id: true } });
    await lockFamilyRows(transaction, [input.familyId]);
    const membership = await transaction.familyMember.findFirst({
      where: { familyId: input.familyId, personId: input.personId, deactivatedAt: null, family: { deactivatedAt: null } },
      include: { person: { select: { firstName: true, lastName: true, dni: true } }, family: { select: { name: true, address: true } } },
    });

    if (!period || !membership) {
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
