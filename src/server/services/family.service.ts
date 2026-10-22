import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { familyRepository } from "@/server/repository/family.repository";
import type { CreateFamilyInput, FindFamiliesOptions, UpdateFamilyInput } from "@/types/family";
import { ApiError } from "@/utils/handlers/apiError.handler";

export const familyService = {
  async findAll(options: FindFamiliesOptions = {}) {
    return familyRepository.findAll(options);
  },

  async findById(id: string) {
    const family = await familyRepository.findById(id);

    if (!family) {
      throw new ApiError({ status: 404, message: "No encontramos esa familia" });
    }

    return family;
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

      return previousOperation.family;
    }

    const providedDnis = input.members.flatMap((member) => member.dni ? [member.dni] : []);

    if (new Set(providedDnis).size !== providedDnis.length) {
      throw new ApiError({ status: 409, message: "El DNI está repetido en el grupo familiar" });
    }

    for (const dni of providedDnis) {
      if (await familyRepository.findPersonByDni(dni)) {
        throw new ApiError({ status: 409, message: "Ese DNI ya está registrado en otra persona" });
      }
    }

    try {
      return await familyRepository.create(input, createdById, operationId, requestHash);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrentOperation = await familyRepository.findOperation(operationId);

        if (concurrentOperation && concurrentOperation.actorId === createdById && concurrentOperation.requestHash === requestHash) {
          return concurrentOperation.family;
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

    return this.findById(id);
  },
};
