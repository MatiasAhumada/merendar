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
      throw new ApiError({ status: httpStatus.CONFLICT, message: "El email ya está registrado" });
    }
    return userRepository.create({ name: dto.name.trim(), email, role: dto.role, passwordHash: await hashPassword(dto.password) });
  },

  async findAll(search?: string) {
    return userRepository.findAll(search?.trim());
  },

  async updateStatus(id: string, actorId: string, isActive: boolean) {
    const user = await userRepository.findById(id);
    if (!user) throw new ApiError({ status: httpStatus.NOT_FOUND, message: "Usuario no encontrado" });
    if (!isActive && actorId === id) throw new ApiError({ status: httpStatus.FORBIDDEN, message: "No podés desactivar tu propia cuenta" });
    if (!isActive && user.role === UserRole.PRESIDENTE && user.isActive && await userRepository.countActivePresidents() <= 1) {
      throw new ApiError({ status: httpStatus.CONFLICT, message: "Debe permanecer al menos una presidencia activa" });
    }
    if (!isActive) return userRepository.deactivate(id);
    return userRepository.update(id, { isActive: true });
  },
};
