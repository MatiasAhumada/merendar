

import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { UserRole } from "@prisma/client";
import { userRepository } from "@/server/repository/user.repository";
import { hashPassword } from "@/server/services/auth.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import httpStatus from "http-status";

interface CreateUserDto {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

export const userService = {
  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await userRepository.findByEmail(email)) {
      throw new ApiError({ status: httpStatus.CONFLICT, message: USER_ERROR_MESSAGES.EL_EMAIL_YA_ESTA_REGISTRADO });
    }
    return userRepository.create({ name: dto.name.trim(), email, role: dto.role, passwordHash: await hashPassword(dto.password) });
  },

  async findAll(search?: string) {
    return userRepository.findAll(search?.trim());
  },

  async updateStatus(id: string, actorId: string, isActive: boolean) {
    const result = await userRepository.updateStatus(id, actorId, isActive);

    if (result.type === "missing") {
      throw new ApiError({ status: httpStatus.NOT_FOUND, message: USER_ERROR_MESSAGES.USUARIO_NO_ENCONTRADO });
    }

    if (result.type === "self") {
      throw new ApiError({ status: httpStatus.FORBIDDEN, message: USER_ERROR_MESSAGES.NO_PODES_DESACTIVAR_TU_PROPIA_CUENTA });
    }

    if (result.type === "last-president") {
      throw new ApiError({ status: httpStatus.CONFLICT, message: USER_ERROR_MESSAGES.DEBE_PERMANECER_AL_MENOS_UNA_PRESIDENCIA_ACTIVA });
    }

    if (result.type === "already-deleted") {
      throw new ApiError({ status: httpStatus.CONFLICT, message: USER_ERROR_MESSAGES.USER_ALREADY_DELETED });
    }

    if (result.type === "actor-unavailable") {
      throw new ApiError({ status: httpStatus.FORBIDDEN, message: USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_USUARIOS });
    }
  },

  async logicallyDelete(id: string, actorId: string) {
    const result = await userRepository.logicallyDelete(id, actorId);

    if (result.type === "missing") {
      throw new ApiError({ status: httpStatus.NOT_FOUND, message: USER_ERROR_MESSAGES.USUARIO_NO_ENCONTRADO });
    }

    if (result.type === "self") {
      throw new ApiError({ status: httpStatus.FORBIDDEN, message: USER_ERROR_MESSAGES.NO_PODES_ELIMINAR_TU_PROPIA_CUENTA });
    }

    if (result.type === "last-president") {
      throw new ApiError({ status: httpStatus.CONFLICT, message: USER_ERROR_MESSAGES.DEBE_PERMANECER_AL_MENOS_UNA_PRESIDENCIA_ACTIVA_PARA_ELIMINAR });
    }

    if (result.type === "actor-unavailable") {
      throw new ApiError({ status: httpStatus.FORBIDDEN, message: USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_USUARIOS });
    }
  },
};
