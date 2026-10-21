import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { familyRepository } from "@/server/repository/family.repository";
import { requireRecordReadAccess } from "@/server/services/record-access";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest) {
  try {
    await requireRecordReadAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const periodId = request.nextUrl.searchParams.get("periodId");
    const [periods, families, records, sheets] = await Promise.all([
      prisma.merchandisePeriod.findMany({
        select: { id: true, label: true, agency: true, startsAt: true, endsAt: true },
        orderBy: { startsAt: "desc" },
      }),
      familyRepository.findAll({}),
      periodId && periodId.length <= 80
        ? prisma.distributionRecord.findMany({
          where: { periodId },
          include: { familyMember: { include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } }, family: { select: { id: true, name: true } } } } },
          orderBy: { createdAt: "desc" },
        })
        : Promise.resolve([]),
      periodId
        ? prisma.beneficiarySheet.findMany({ where: { periodId }, select: { id: true, version: true, createdAt: true }, orderBy: { version: "desc" }, take: 20 })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      periods,
      families,
      records: records.map(({ familyMember, ...record }) => ({
        ...record,
        personId: familyMember.person.id,
        person: familyMember.person,
        family: familyMember.family,
      })),
      sheets,
    }, { headers: privateHeaders });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError({ status: 500, message: "No se pudo consultar el registro de módulos", isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo consultar el registro de módulos" });
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  }
}
