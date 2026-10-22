import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { familyRepository } from "@/server/repository/family.repository";
import type { CreateFamilyInput, FamilyMemberChangeInput, FindFamiliesOptions, UpdateFamilyInput } from "@/types/family";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { toFamilyRecord } from "@/server/mappers/family.mapper";

export const familyService = {
  async findAll(options: FindFamiliesOptions = {}) {
    const families = await familyRepository.findAll(options);
    return families.map(toFamilyRecord);
  },

  async findById(id: string) {
    const family = await familyRepository.findById(id);

    if (!family) {
      throw new ApiError({ status: 404, message: "No encontramos esa familia" });
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
        throw new ApiError({ status: 409, message: "La clave de operación ya se usó con otros datos" });
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
      throw new ApiError({ status: 409, message: "El DNI está repetido en el grupo familiar" });
    }

    for (const dni of providedDnis) {
      if (await familyRepository.findPersonByDni(dni)) {
        throw new ApiError({ status: 409, message: "Ese DNI ya está registrado en otra persona" });
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

        throw new ApiError({ status: 409, message: "Una persona con ese DNI ya está registrada" });
      }

      throw error;
    }
  },

  async update(id: string, input: UpdateFamilyInput) {
    const updateResult = await familyRepository.update(id, input);

    if (!updateResult.count) {
      await this.findById(id);
      throw new ApiError({ status: 409, message: "La ficha cambió en otro dispositivo. Actualizá antes de guardar" });
    }

    const family = await familyRepository.findById(id);

    if (!family) {
      throw new ApiError({ status: 404, message: "No encontramos esa familia" });
    }

    return toFamilyRecord(family);
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
      throw new ApiError({ status: 404, message: "No encontramos esa familia" });
    }

    const referenceBelongsToFamily = family.members.some((membership) => membership.personId === input.referencePersonId);
    const referenceIsNewMember = input.action === "add-member" && input.personId === input.referencePersonId;

    if (!referenceBelongsToFamily && !referenceIsNewMember) {
      throw new ApiError({ status: 400, message: "Elegí como referente a una persona de esta familia" });
    }

    if (input.action === "update-member" && !family.members.some((membership) => membership.id === input.memberId)) {
      throw new ApiError({ status: 404, message: "No encontramos ese integrante en esta familia" });
    }

    const requestHash = createHash("sha256").update(JSON.stringify({ familyId, baseVersion, ...input })).digest("hex");
    const previousOperation = await familyRepository.findOperation(operationId);

    if (previousOperation) {
      if (previousOperation.actorId !== actorId || previousOperation.requestHash !== requestHash) {
        throw new ApiError({ status: 409, message: "La clave de operación ya se usó con otros datos" });
      }

      return toFamilyRecord(previousOperation.family);
    }

    try {
      const result = await familyRepository.applyMemberChange(familyId, baseVersion, actorId, operationId, requestHash, input);

      if (result.type === "missing") {
        throw new ApiError({ status: 404, message: "No encontramos esa familia" });
      }

      if (result.type === "missing-member") {
        throw new ApiError({ status: 404, message: "No encontramos ese integrante en esta familia" });
      }

      if (result.type === "duplicate-dni") {
        throw new ApiError({ status: 409, message: "Ese DNI ya está registrado en otra persona" });
      }

      if (result.type === "conflict") {
        throw new ApiError({ status: 409, message: "La ficha cambió en otro dispositivo. Actualizá antes de guardar" });
      }

      return toFamilyRecord(result.family);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiError({ status: 409, message: "Ese DNI o identificador ya está registrado" });
      }

      throw error;
    }
  },
};
