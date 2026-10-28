

import { FAMILY_ERROR_MESSAGES } from "@/constants/family.constant";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { familyRepository, type FamilyDeactivationTarget } from "@/server/repository/family.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { toFamilyRecord } from "@/server/mappers/family.mapper";
import type { CreateFamilyInput, FamilyMemberChangeInput, FindFamiliesOptions, UpdateFamilyInput } from "@/types/family";

export const familyService = {
  async findAll(options: FindFamiliesOptions = {}) {
    const families = await familyRepository.findAll(options);
    return families.map(toFamilyRecord);
  },

  async findById(id: string) {
    const family = await familyRepository.findById(id);

    if (!family) {
      throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_FAMILIA });
    }

    return toFamilyRecord(family);
  },

  async create(input: CreateFamilyInput, createdById: string, operationId: string) {
    const requestHash = createHash("sha256").update(JSON.stringify({
      ...input,
      members: input.members.map((member) => ({
        ...member,
        missingDocuments: [...member.missingDocuments].sort(),
      })),
    })).digest("hex");
    const previousOperation = await familyRepository.findOperation(operationId);

    if (previousOperation) {
      if (previousOperation.actorId !== createdById || previousOperation.requestHash !== requestHash) {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.LA_CLAVE_DE_OPERACION_YA_SE_USO_CON_OTROS_DATOS });
      }

      return toFamilyRecord(previousOperation.family);
    }

    const providedDnis = input.members.flatMap((member) => {
      if (!member.dni) {
        return [];
      }

      return [member.dni];
    });

    if (new Set(providedDnis).size !== providedDnis.length) {
      throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.EL_DNI_ESTA_REPETIDO_EN_EL_GRUPO_FAMILIAR });
    }

    for (const dni of providedDnis) {
      if (await familyRepository.findPersonByDni(dni)) {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.ESE_DNI_YA_ESTA_REGISTRADO_EN_OTRA_PERSONA });
      }
    }

    try {
      return toFamilyRecord(await familyRepository.create(input, createdById, operationId, requestHash));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrentOperation = await familyRepository.findOperation(operationId);

        if (concurrentOperation && concurrentOperation.actorId === createdById && concurrentOperation.requestHash === requestHash) {
        return toFamilyRecord(concurrentOperation.family);
        }

        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.UNA_PERSONA_CON_ESE_DNI_YA_ESTA_REGISTRADA });
      }

      throw error;
    }
  },

  async update(id: string, input: UpdateFamilyInput) {
    const updateResult = await familyRepository.update(id, input);

    if (!updateResult.count) {
      await this.findById(id);
      throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.LA_FICHA_CAMBIO_EN_OTRO_DISPOSITIVO_ACTUALIZA_ANTES_DE_GUARDAR });
    }

    const family = await familyRepository.findById(id);

    if (!family) {
      throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_FAMILIA });
    }

    return toFamilyRecord(family);
  },

  async deactivate(
    familyId: string,
    target: FamilyDeactivationTarget,
    actorId: string,
    operationId: string,
    baseVersion: number,
  ) {
    const requestHash = createHash("sha256").update(JSON.stringify({ familyId, target, baseVersion })).digest("hex");

    try {
      const result = await familyRepository.deactivate({ familyId, target, actorId, operationId, baseVersion, requestHash });

      if (result.type === "missing") {
        throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_FAMILIA });
      }

      if (result.type === "missing-member") {
        throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_INTEGRANTE_EN_ESTA_FAMILIA });
      }

      if (result.type === "last-member") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.NO_SE_PUEDE_DAR_DE_BAJA_AL_ULTIMO_INTEGRANTE_PRIMERO_AGREGA_OTRA_PERSO });
      }

      if (result.type === "reference-member") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.NO_SE_PUEDE_DAR_DE_BAJA_AL_REFERENTE_PRIMERO_ELEGI_OTRO_REFERENTE_PARA });
      }

      if (result.type === "has-records") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.NO_SE_PUEDE_DAR_DE_BAJA_PORQUE_LA_FAMILIA_O_EL_INTEGRANTE_APARECE_EN_E });
      }

      if (result.type === "conflict") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.LA_FICHA_CAMBIO_EN_OTRO_DISPOSITIVO_ACTUALIZA_ANTES_DE_VOLVER_A_INTENT });
      }

      return toFamilyRecord(result.family);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.LA_FICHA_CAMBIO_MIENTRAS_SE_PROCESABA_LA_BAJA_ACTUALIZA_ANTES_DE_VOLVE });
      }

      throw error;
    }
  },

  async changeMember(
    familyId: string,
    input: FamilyMemberChangeInput,
    actorId: string,
    operationId: string,
    baseVersion: number,
  ) {
    const family = await familyRepository.findById(familyId);

    if (!family) {
      throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_FAMILIA });
    }

    const referenceBelongsToFamily = family.members.some((membership) => membership.personId === input.referencePersonId);
    const referenceIsNewMember = input.action === "add-member" && input.personId === input.referencePersonId;

    if (!referenceBelongsToFamily && !referenceIsNewMember) {
      throw new ApiError({ status: 400, message: FAMILY_ERROR_MESSAGES.ELEGI_COMO_REFERENTE_A_UNA_PERSONA_DE_ESTA_FAMILIA });
    }

    if (input.action === "update-member" && !family.members.some((membership) => membership.id === input.memberId)) {
      throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_INTEGRANTE_EN_ESTA_FAMILIA });
    }

    const requestHash = createHash("sha256").update(JSON.stringify({ familyId, baseVersion, ...input })).digest("hex");
    const previousOperation = await familyRepository.findOperation(operationId);

    if (previousOperation) {
      if (previousOperation.actorId !== actorId || previousOperation.requestHash !== requestHash) {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.LA_CLAVE_DE_OPERACION_YA_SE_USO_CON_OTROS_DATOS });
      }

      return toFamilyRecord(previousOperation.family);
    }

    try {
      const result = await familyRepository.applyMemberChange(familyId, baseVersion, actorId, operationId, requestHash, input);

      if (result.type === "missing") {
        throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_FAMILIA });
      }

      if (result.type === "missing-member") {
        throw new ApiError({ status: 404, message: FAMILY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_INTEGRANTE_EN_ESTA_FAMILIA });
      }

      if (result.type === "duplicate-dni") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.ESE_DNI_YA_ESTA_REGISTRADO_EN_OTRA_PERSONA });
      }

      if (result.type === "conflict") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.LA_FICHA_CAMBIO_EN_OTRO_DISPOSITIVO_ACTUALIZA_ANTES_DE_GUARDAR });
      }

      return toFamilyRecord(result.family);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiError({ status: 409, message: FAMILY_ERROR_MESSAGES.ESE_DNI_O_IDENTIFICADOR_YA_ESTA_REGISTRADO });
      }

      throw error;
    }
  },
};
