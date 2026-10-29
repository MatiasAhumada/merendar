import { z } from "zod";

export const dashboardSummarySchema = z.object({
  familyCount: z.number().int().nonnegative(),
  personCount: z.number().int().nonnegative(),
  approvedQuotaCount: z.number().int().nonnegative().nullable(),
  activePeriodLabel: z.string().nullable(),
  lastUpdatedAt: z.iso.datetime().nullable(),
});

export const dashboardSummaryResponseSchema = z.discriminatedUnion("authorized", [
  z.object({ authorized: z.literal(true), summary: dashboardSummarySchema }),
  z.object({ authorized: z.literal(false) }),
]);
