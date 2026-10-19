import { prisma } from "@/lib/prisma";

interface CreateUserDto {
  name: string;
  email: string;
  role: import("@prisma/client").UserRole;
  passwordHash: string;
}

type UpdateUserDto = { isActive?: boolean };

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
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
  },

  async deactivate(id: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id }, data: { isActive: false } });
      await transaction.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  },

  async countActivePresidents() {
    return prisma.user.count({ where: { role: "PRESIDENTE", isActive: true } });
  },
};
