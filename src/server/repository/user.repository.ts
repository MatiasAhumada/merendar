import { prisma } from "@/lib/prisma";
import { Prisma, UserRole } from "@prisma/client";

interface CreateUserDto {
  name: string;
  email: string;
  role: import("@prisma/client").UserRole;
  passwordHash: string;
}

type UserMutationResult =
  | { type: "updated" }
  | { type: "missing" }
  | { type: "self" }
  | { type: "last-president" }
  | { type: "already-deleted" }
  | { type: "actor-unavailable" };

async function runSerializableUserMutation(operation: (transaction: Prisma.TransactionClient) => Promise<UserMutationResult>) {
  let retryCount = 0;

  while (retryCount < 3) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || retryCount === 2) {
        throw error;
      }

      retryCount += 1;
    }
  }

  throw new Error("No se pudo completar el cambio de cuenta.");
}

export const userRepository = {
  async create(dto: CreateUserDto) {
    return prisma.user.create({
      data: dto,
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  async findAll(search?: string) {
    let where: Prisma.UserWhereInput = { deletedAt: null };

    if (search) {
      where = { AND: [{ deletedAt: null }, { OR: [{ name: { contains: search } }, { email: { contains: search } }] }] };
    }

    return prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
  },

  async updateStatus(id: string, actorId: string, isActive: boolean): Promise<UserMutationResult> {
    return runSerializableUserMutation(async (transaction) => {
      const actor = await transaction.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true, deletedAt: true } });

      if (!actor || actor.role !== UserRole.PRESIDENTE || !actor.isActive || actor.deletedAt) {
        return { type: "actor-unavailable" };
      }

      const targetUser = await transaction.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true, deletedAt: true } });

      if (!targetUser) {
        return { type: "missing" };
      }

      if (targetUser.deletedAt) {
        return { type: "already-deleted" };
      }

      if (!isActive && actorId === id) {
        return { type: "self" };
      }

      if (!isActive && targetUser.role === UserRole.PRESIDENTE && targetUser.isActive) {
        const activePresidents = await transaction.user.count({ where: { role: UserRole.PRESIDENTE, isActive: true, deletedAt: null } });

        if (activePresidents <= 1) {
          return { type: "last-president" };
        }
      }

      await transaction.user.update({ where: { id }, data: { isActive } });

      if (!isActive) {
        await transaction.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }

      return { type: "updated" };
    });
  },

  async logicallyDelete(id: string, actorId: string): Promise<UserMutationResult> {
    return runSerializableUserMutation(async (transaction) => {
      const actor = await transaction.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true, deletedAt: true } });

      if (!actor || actor.role !== UserRole.PRESIDENTE || !actor.isActive || actor.deletedAt) {
        return { type: "actor-unavailable" };
      }

      if (actorId === id) {
        return { type: "self" };
      }

      const targetUser = await transaction.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true, deletedAt: true } });

      if (!targetUser) {
        return { type: "missing" };
      }

      if (targetUser.deletedAt) {
        return { type: "already-deleted" };
      }

      if (targetUser.role === UserRole.PRESIDENTE && targetUser.isActive) {
        const activePresidents = await transaction.user.count({ where: { role: UserRole.PRESIDENTE, isActive: true, deletedAt: null } });

        if (activePresidents <= 1) {
          return { type: "last-president" };
        }
      }

      await transaction.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date(), deletedById: actorId } });
      await transaction.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });

      return { type: "updated" };
    });
  },

};
