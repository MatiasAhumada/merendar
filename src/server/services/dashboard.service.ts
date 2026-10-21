import { UserRole } from "@prisma/client";
import { dashboardRepository } from "@/server/repository/dashboard.repository";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import type { DashboardSummaryResult } from "@/types/dashboard";

export const dashboardService = {
  async getSummary(role: UserRole): Promise<DashboardSummaryResult> {
    if (!await hasEffectiveCapability(role, "dashboard.metrics.read")) {
      return { authorized: false };
    }

    return {
      authorized: true,
      summary: await dashboardRepository.findSummary(new Date()),
    };
  },
};
