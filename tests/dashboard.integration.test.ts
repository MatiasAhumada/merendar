import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dashboardRepository } from "@/server/repository/dashboard.repository";
import { canViewDashboardMetrics } from "@/server/services/dashboard-access";

test("dashboard summary reads persistent counts and restricts metrics by role", async () => {
  assert.equal(process.env.ALLOW_DASHBOARD_INTEGRATION_TESTS, "true");
  const databaseUrl = new URL(String(process.env.DATABASE_URL));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname));
  assert.match(databaseUrl.pathname.toLowerCase(), /(dev|test|local)/);

  const suffix = randomBytes(10).toString("hex");
  const userId = randomUUID();
  const familyId = randomUUID();
  const personId = randomUUID();
  const periodId = randomUUID();
  const requestId = randomUUID();
  let createdPeriod = false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const activePeriod = await prisma.merchandisePeriod.findFirst({
    where: { startsAt: { lte: today }, endsAt: { gte: today } },
    orderBy: { startsAt: "desc" },
    select: { id: true },
  });

  assert.equal(canViewDashboardMetrics(UserRole.PRESIDENTE), true);
  assert.equal(canViewDashboardMetrics(UserRole.SECRETARIA), true);
  assert.equal(canViewDashboardMetrics(UserRole.TESORERIA), false);

  try {
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: `dashboard-${suffix}@example.test`,
        name: "Dashboard Integration Test",
        role: UserRole.PRESIDENTE,
      },
    });
    const oneYearFromToday = new Date(today);
    oneYearFromToday.setUTCFullYear(oneYearFromToday.getUTCFullYear() + 1);

    if (!activePeriod) {
      await prisma.merchandisePeriod.create({
        data: {
          id: periodId,
          label: `Dashboard Test ${suffix}`,
          agency: `Integration Test ${suffix}`,
          startsAt: today,
          endsAt: oneYearFromToday,
        },
      });
      createdPeriod = true;
    }

    const summaryBefore = await dashboardRepository.findSummary(new Date());

    await prisma.person.create({
      data: {
        id: personId,
        firstName: "Dashboard",
        lastName: `Test ${suffix}`,
        dni: `${(10_000_000 + Number.parseInt(suffix.slice(0, 7), 16) % 90_000_000).toString()}`,
      },
    });
    await prisma.family.create({
      data: {
        id: familyId,
        name: `Dashboard Test ${suffix}`,
        neighborhood: "Villa Nueva",
        address: "Calle de integración 10",
        referencePersonId: personId,
        createdById: user.id,
        members: { create: [{ personId, relationship: "Titular" }] },
      },
    });
    await prisma.merchandiseRequest.create({
      data: {
        id: requestId,
        periodId: activePeriod?.id ?? periodId,
        requestNumber: `DASH-${suffix}`,
        requestedAt: today,
        requestedQuantity: 9,
        status: "APROBADA",
        createdById: user.id,
      },
    });
    await prisma.merchandiseQuota.create({
      data: {
        requestId,
        approvedQuantity: 7,
        approvedAt: today,
        approvedById: user.id,
      },
    });

    const summaryAfter = await dashboardRepository.findSummary(new Date());

    assert.equal(summaryAfter.familyCount, summaryBefore.familyCount + 1);
    assert.equal(summaryAfter.personCount, summaryBefore.personCount + 1);
    assert.equal(summaryAfter.approvedQuotaCount, (summaryBefore.approvedQuotaCount ?? 0) + 7);
    const familyUpdatedAt = await prisma.family.findUniqueOrThrow({ where: { id: familyId } });
    assert.ok(Date.parse(summaryAfter.lastUpdatedAt ?? "") >= familyUpdatedAt.updatedAt.getTime());
  } finally {
    await prisma.merchandiseQuota.deleteMany({ where: { requestId } });
    await prisma.merchandiseRequest.deleteMany({ where: { id: requestId } });
    await prisma.family.deleteMany({ where: { id: familyId } });
    await prisma.person.deleteMany({ where: { id: personId } });

    if (createdPeriod) {
      await prisma.merchandisePeriod.deleteMany({ where: { id: periodId } });
    }

    await prisma.user.deleteMany({ where: { id: userId } });
  }
});
