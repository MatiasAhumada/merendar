

import { FAMILY_ERROR_MESSAGES } from "@/constants/family.constant";
import { familyDeactivationTargetSchema, familyPayloadSchema, familyMemberChangeSchema } from "@/schemas/family.schema";
import { createHash } from "node:crypto";
import { nonNegativeIntegerSchema, nullableSchema } from "@/schemas/offline.schema";
import { deactivateFamilyInTransaction } from "@/server/repository/family.repository";
import type { SyncHandlerResult, SynchronizationHandler } from "@/interfaces/synchronization.interface";

export class FamilyDeactivationSyncError extends Error {
  readonly code: "family_deactivation_blocked" | "family_member_deactivation_blocked";

  constructor(code: FamilyDeactivationSyncError["code"], message: string) {
    super(message);
    this.name = "FamilyDeactivationSyncError";
    this.code = code;
  }
}

export const familySynchronizationHandler: SynchronizationHandler = {
  async apply(transaction, operation): Promise<SyncHandlerResult> {
    const baseVersionValidation = nullableSchema.safeParse(operation.baseVersion);

    if (operation.operation === "delete") {
      const baseVersion = nonNegativeIntegerSchema.safeParse(operation.baseVersion);
      const parsedTarget = familyDeactivationTargetSchema.safeParse(operation.payload);

      if (!baseVersion.success || !parsedTarget.success) {
        throw new Error(FAMILY_ERROR_MESSAGES.LA_BAJA_FAMILIAR_NO_TIENE_UNA_VERSION_BASE_O_UN_DESTINO_VALIDO);
      }

      const requestHash = createHash("sha256").update(JSON.stringify({
        familyId: operation.resourceId,
        target: parsedTarget.data,
        baseVersion: baseVersion.data,
      })).digest("hex");
      const result = await deactivateFamilyInTransaction(transaction, {
        familyId: operation.resourceId,
        target: parsedTarget.data,
        baseVersion: baseVersion.data,
        actorId: operation.userId,
        operationId: operation.operationId,
        requestHash,
      });

      if (result.type === "deactivated") {
        return {
          type: "synchronized",
          resourceVersion: result.family.version,
          result: { resourceId: result.family.id, name: result.family.name },
        };
      }

      if (result.type === "conflict") {
        const currentFamily = await transaction.family.findUnique({ where: { id: operation.resourceId }, select: { version: true } });
        const currentVersion = currentFamily?.version ?? 0;
        return { type: "conflict", resourceVersion: currentVersion, current: { kind: "family_changed", version: currentVersion } };
      }

      let message: string = FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_FAMILIA_PARA_DAR_DE_BAJA;

      if (result.type === "missing-member") {
        message = FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_INTEGRANTE_EN_ESTA_FAMILIA;
      }

      if (result.type === "has-records") {
        message = FAMILY_ERROR_MESSAGES.NO_SE_PUEDE_DAR_DE_BAJA_PORQUE_LA_FAMILIA_O_EL_INTEGRANTE_APARECE_EN_E;
      }

      if (result.type === "last-member") {
        message = FAMILY_ERROR_MESSAGES.NO_SE_PUEDE_DAR_DE_BAJA_AL_ULTIMO_INTEGRANTE_PRIMERO_AGREGA_OTRA_PERSO;
      }

      if (result.type === "reference-member") {
        message = FAMILY_ERROR_MESSAGES.NO_SE_PUEDE_DAR_DE_BAJA_AL_REFERENTE_PRIMERO_ELEGI_OTRO_REFERENTE_PARA;
      }

      let code: "family_deactivation_blocked" | "family_member_deactivation_blocked" = "family_member_deactivation_blocked";

      if (parsedTarget.data.kind === "family") {
        code = "family_deactivation_blocked";
      }

      throw new FamilyDeactivationSyncError(code, message);
    }

    if (operation.operation === "create") {
      if (!baseVersionValidation.success) {
        throw new Error(FAMILY_ERROR_MESSAGES.EL_ALTA_DE_FAMILIA_NO_TIENE_UNA_VERSION_BASE_VALIDA);
      }

      const parsedPayload = familyPayloadSchema.safeParse(operation.payload);

      if (!parsedPayload.success) {
        throw new Error(FAMILY_ERROR_MESSAGES.LA_OPERACION_FAMILIAR_NO_TIENE_UN_FORMATO_VALIDO);
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
        throw new Error(FAMILY_ERROR_MESSAGES.LA_OPERACION_FAMILIAR_NO_INDICA_UN_REFERENTE_VALIDO);
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
                throw new Error(FAMILY_ERROR_MESSAGES.LA_OPERACION_FAMILIAR_CONTIENE_UNA_PERSONA_INCOMPLETA);
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

    if (operation.operation !== "update" || !nonNegativeIntegerSchema.safeParse(operation.baseVersion).success) {
      throw new Error(FAMILY_ERROR_MESSAGES.LA_OPERACION_FAMILIAR_NO_ESTA_HABILITADA_PARA_SINCRONIZAR);
    }

    const parsedChange = familyMemberChangeSchema.safeParse(operation.payload);

    if (!parsedChange.success) {
      throw new Error(FAMILY_ERROR_MESSAGES.LA_OPERACION_DE_INTEGRANTE_NO_TIENE_UN_FORMATO_VALIDO);
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

    const family = await transaction.family.findFirst({
      where: { id: operation.resourceId, deactivatedAt: null },
      include: { members: { where: { deactivatedAt: null } } },
    });

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
