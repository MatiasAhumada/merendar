

import { HTTP_CACHE_CONTROL, HTTP_HEADERS, HTTP_CONTENT_TYPES, PRIVATE_DOCUMENT_RESPONSE_HEADERS } from "@/constants/http.constant";
import { DELIVERY_ERROR_MESSAGES } from "@/constants/delivery.constant";
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
      throw new ApiError({ status: 404, message: DELIVERY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_PLANILLA });
    }

    const pdf = await createBeneficiarySheetPdf(sheet.snapshot);
    const fileName = sheet.period.label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        ...PRIVATE_DOCUMENT_RESPONSE_HEADERS,
        [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.PDF,
        [HTTP_HEADERS.CONTENT_DISPOSITION]: `attachment; filename="planilla-${fileName}-v${sheet.version}.pdf"`,
      },
    });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError({ status: 500, message: DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_DESCARGAR_LA_PLANILLA, isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_DESCARGAR_LA_PLANILLA });
    response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
    return response;
  }
}
