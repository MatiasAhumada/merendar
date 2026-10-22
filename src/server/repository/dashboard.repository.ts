import { prisma } from "@/lib/prisma";

function latestDate(dates: Array<Date | null>) {
  let newestDate: Date | null = null;

  for (const date of dates) {
    if (date && (!newestDate || date.getTime() > newestDate.getTime())) {
      newestDate = date;
    }
  }

  return newestDate;
}

export const dashboardRepository = {
  async findSummary(now: Date) {
    const currentDate = new Date(now);
    currentDate.setUTCHours(0, 0, 0, 0);

    const activePeriod = await prisma.merchandisePeriod.findFirst({
      where: { startsAt: { lte: currentDate }, endsAt: { gte: currentDate } },
      orderBy: { startsAt: "desc" },
      select: { id: true, label: true, updatedAt: true },
    });

    const [familyCount, personCount, latestFamily, latestPerson] = await Promise.all([
      prisma.family.count(),
      prisma.person.count(),
      prisma.family.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
      prisma.person.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    ]);

    let approvedQuotaCount: number | null = null;
    let latestQuota: { updatedAt: Date } | null = null;

    if (activePeriod) {
      const quotaFilter = { request: { periodId: activePeriod.id } };
      const [quotaSummary, mostRecentlyUpdatedQuota] = await Promise.all([
        prisma.merchandiseQuota.aggregate({
          where: quotaFilter,
          _sum: { approvedQuantity: true },
        }),
        prisma.merchandiseQuota.findFirst({
          where: quotaFilter,
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        }),
      ]);
      approvedQuotaCount = quotaSummary._sum.approvedQuantity ?? 0;
      latestQuota = mostRecentlyUpdatedQuota;
    }

    const lastUpdatedAt = latestDate([
      latestFamily?.updatedAt ?? null,
      latestPerson?.updatedAt ?? null,
      activePeriod?.updatedAt ?? null,
      latestQuota?.updatedAt ?? null,
    ]);

    return {
      familyCount,
      personCount,
      approvedQuotaCount,
      activePeriodLabel: activePeriod?.label ?? null,
      lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    };
  },
};
