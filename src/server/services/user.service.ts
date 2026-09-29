import { userRepository } from "@/server/repository/user.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";
import httpStatus from "http-status";

interface CreateUserDto {
  name: string;
  email: string;
}

interface UpdateUserDto extends Partial<CreateUserDto> {}

export const userService = {
  async create(dto: CreateUserDto) {
    const existingUser = await userRepository.findByEmail(dto.email);

    if (existingUser) {
      throw new ApiError({
        status: httpStatus.CONFLICT,
        message: "El email ya está registrado",
      });
    }

    return userRepository.create(dto);
  },

  async findById(id: string) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new ApiError({
        status: httpStatus.NOT_FOUND,
        message: "Usuario no encontrado",
      });
    }

    return user;
  },

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);

    if (dto.email) {
      const existingUser = await userRepository.findByEmail(dto.email);

      if (existingUser && existingUser.id !== id) {
        throw new ApiError({
          status: httpStatus.CONFLICT,
          message: "El email ya está registrado",
        });
      }
    }

    return userRepository.update(id, dto);
  },

  async delete(id: string) {
    await this.findById(id);
    return userRepository.delete(id);
  },

  async findAll(search?: string) {
    return userRepository.findAll(search);
  },
};
