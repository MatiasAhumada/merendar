export interface DashboardSummary {
  familyCount: number;
  personCount: number;
  approvedQuotaCount: number | null;
  activePeriodLabel: string | null;
  lastUpdatedAt: string | null;
}

export type DashboardSummaryResult =
  | { authorized: true; summary: DashboardSummary }
  | { authorized: false };
