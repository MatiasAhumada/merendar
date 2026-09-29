import { prisma } from "@/lib/prisma";

interface CreateUserDto {
  name: string;
  email: string;
}

interface UpdateUserDto extends Partial<CreateUserDto> {}

export const userRepository = {
  async create(dto: CreateUserDto) {
    return prisma.user.create({
      data: dto,
    });
  },

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async update(id: string, dto: UpdateUserDto) {
    return prisma.user.update({
      where: { id },
      data: dto,
    });
  },

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  },

  async findAll(search?: string) {
    const where = search
      ? {
          OR: [{ name: { contains: search } }, { email: { contains: search } }],
        }
      : {};

    return prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  },
};
