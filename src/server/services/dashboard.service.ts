import "server-only";
import { UserRole } from "@prisma/client";
import { dashboardRepository } from "@/server/repository/dashboard.repository";
import { canViewDashboardMetrics } from "@/server/services/dashboard-access";
import type { DashboardSummaryResult } from "@/types/dashboard";

export const dashboardService = {
  async getSummary(role: UserRole): Promise<DashboardSummaryResult> {
    if (!canViewDashboardMetrics(role)) {
      return { authorized: false };
    }

    return {
      authorized: true,
      summary: await dashboardRepository.findSummary(new Date()),
    };
  },
};
