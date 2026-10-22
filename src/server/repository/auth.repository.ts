import { prisma } from "@/lib/prisma";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  role: true,
} as const;

export const authRepository = {
  async findUserByIdentifier(identifier: string) {
    return prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
  },

  async countRecentAttempts(candidateKey: string, since: Date) {
    return prisma.loginAttempt.count({
      where: { candidateKey, createdAt: { gte: since } },
    });
  },

  async recordFailedAttempt(candidateKey: string) {
    await prisma.loginAttempt.create({ data: { candidateKey } });
  },

  async clearAttempts(candidateKey: string) {
    await prisma.loginAttempt.deleteMany({ where: { candidateKey } });
  },

  async cleanExpiredAttempts(before: Date) {
    await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: before } } });
  },

  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    await prisma.authSession.create({ data: { userId, tokenHash, expiresAt } });
  },

  async findActiveSession(tokenHash: string, now: Date) {
    return prisma.authSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { isActive: true, role: { not: null } },
      },
      select: {
        id: true,
        expiresAt: true,
        user: { select: publicUserSelect },
      },
    });
  },

  async revokeSession(tokenHash: string, revokedAt: Date) {
    await prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt },
    });
  },
};
