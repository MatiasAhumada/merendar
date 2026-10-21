import { UserRole } from "@prisma/client";

const dashboardDataRoles: UserRole[] = [UserRole.PRESIDENTE, UserRole.SECRETARIA];

export function canViewDashboardMetrics(role: UserRole) {
  return dashboardDataRoles.includes(role);
}
