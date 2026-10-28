

import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { prisma } from "@/lib/prisma";
import type { AccessCapability, UserRole } from "@prisma/client";

export const accessPolicyRepository = {
  async findEnabledCapabilities(role: UserRole) {
    const policies = await prisma.roleCapabilityPolicy.findMany({
      where: { role, enabled: true },
      select: { capability: true },
    });
    return policies.map((policy) => policy.capability);
  },

  async findManagementSnapshot() {
    const [policies, users, changes] = await Promise.all([
      prisma.roleCapabilityPolicy.findMany({ select: { role: true, capability: true, enabled: true } }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, isActive: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      }),
      prisma.accessPolicyChange.findMany({
        take: 30,
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true } } },
      }),
    ]);

    return { policies, users, changes };
  },

  async saveRolePolicies(
    actorId: string,
    policies: Array<{ role: UserRole; capability: AccessCapability; enabled: boolean }>,
  ) {
    return prisma.$transaction(async (transaction) => {
      const currentPolicies = await transaction.roleCapabilityPolicy.findMany();
      const currentByKey = new Map(currentPolicies.map((policy) => [`${policy.role}:${policy.capability}`, policy.enabled]));
      const activePresidents = await transaction.user.count({ where: { role: "PRESIDENTE", isActive: true } });

      if (!activePresidents) {
        throw new Error(USER_ERROR_MESSAGES.DEBE_EXISTIR_AL_MENOS_UNA_CUENTA_ACTIVA_DE_PRESIDENCIA);
      }

      for (const policy of policies) {
        const previousValue = currentByKey.get(`${policy.role}:${policy.capability}`) ?? false;
        await transaction.roleCapabilityPolicy.upsert({
          where: { role_capability: { role: policy.role, capability: policy.capability } },
          create: policy,
          update: { enabled: policy.enabled },
        });

        if (previousValue !== policy.enabled) {
          await transaction.accessPolicyChange.create({
            data: {
              actorId,
              role: policy.role,
              capability: policy.capability,
              previousValue,
              newValue: policy.enabled,
            },
          });
        }
      }
    }, { isolationLevel: "Serializable" });
  },
};
