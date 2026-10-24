import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { requireRecordWriteAccess } from "@/server/services/record-access";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { beneficiarySheetSchema } from "@/validations/record.validation";
import { lockFamilyRows } from "@/server/services/record-synchronization.service";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio" });
    }

    const user = await requireRecordWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const body = await request.json().catch(() => null);
    const parsedInput = beneficiarySheetSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: { message: "Seleccioná al menos un beneficiario válido", details: parsedInput.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    }

    const { periodId, personIds } = parsedInput.data;
    const sheet = await prisma.$transaction(async (transaction) => {
      const period = await transaction.merchandisePeriod.findUnique({ where: { id: periodId } });

      if (!period) {
        throw new ApiError({ status: 404, message: "No encontramos ese módulo o período" });
      }

      const existingMemberships = await transaction.familyMember.findMany({
        where: { personId: { in: personIds } },
        select: { familyId: true },
      });
      await lockFamilyRows(transaction, existingMemberships.map((membership) => membership.familyId));
      const memberships = await transaction.familyMember.findMany({
        where: { personId: { in: personIds }, deactivatedAt: null, family: { deactivatedAt: null } },
        include: { person: { select: { id: true, firstName: true, lastName: true, dni: true } }, family: { select: { name: true, address: true, neighborhood: true } } },
        orderBy: [{ family: { name: "asc" } }, { person: { lastName: "asc" } }, { person: { firstName: "asc" } }],
      });

      if (memberships.length !== personIds.length || memberships.some((membership) => !membership.person.dni)) {
        throw new ApiError({ status: 400, message: "Todos los beneficiarios deben pertenecer al padrón y tener DNI registrado" });
      }

      const version = await transaction.beneficiarySheet.count({ where: { periodId } }) + 1;
      const createdAt = new Date().toISOString();
      const snapshot: Prisma.InputJsonValue = {
        period: {
          label: period.label,
          agency: period.agency,
          startsAt: period.startsAt.toISOString().slice(0, 10),
          endsAt: period.endsAt.toISOString().slice(0, 10),
        },
        version,
        createdAt,
        templateVersion: 2,
        beneficiaries: memberships.map(({ person, family }) => ({
          personId: person.id,
          name: `${person.firstName} ${person.lastName}`,
          dni: person.dni ?? "",
          familyName: family.name,
          address: family.address,
          neighborhood: family.neighborhood,
        })),
      };

      return transaction.beneficiarySheet.create({
        data: { periodId, version, snapshot, createdById: user.id },
        select: { id: true, version: true, createdAt: true },
      });
    }, { isolationLevel: "Serializable" });

    return NextResponse.json({ sheet }, { status: 201, headers: privateHeaders });
  } catch (error) {
    let apiError = new ApiError({ status: 500, message: "No se pudo emitir la planilla", isOperational: false });

    if (error instanceof ApiError) {
      apiError = error;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      apiError = new ApiError({ status: 409, message: "El padrón cambió mientras se emitía la planilla. Actualizá los datos y volvé a intentar." });
    }
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo emitir la planilla" });
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  }
}
