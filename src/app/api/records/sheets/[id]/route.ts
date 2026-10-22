import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { requireRecordReadAccess } from "@/server/services/record-access";
import { createBeneficiarySheetPdf } from "@/server/services/beneficiary-sheet.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";

export async function GET(request: NextRequest, context: RouteContext<"/api/records/sheets/[id]">) {
  try {
    await requireRecordReadAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await context.params;
    const sheet = await prisma.beneficiarySheet.findUnique({ where: { id }, include: { period: { select: { label: true } } } });

    if (!sheet) {
      throw new ApiError({ status: 404, message: "No encontramos esa planilla" });
    }

    const pdf = await createBeneficiarySheetPdf(sheet.snapshot);
    const fileName = sheet.period.label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="planilla-${fileName}-v${sheet.version}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError({ status: 500, message: "No se pudo descargar la planilla", isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo descargar la planilla" });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }
}
