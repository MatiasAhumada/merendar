

import { PRIVATE_RESPONSE_HEADERS, HTTP_CACHE_CONTROL, HTTP_HEADERS } from "@/constants/http.constant";
import { DELIVERY_ERROR_MESSAGES } from "@/constants/delivery.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { requireRecordWriteAccess } from "@/server/services/record-access";
import { issueBeneficiarySheet } from "@/server/services/record.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { beneficiarySheetSchema } from "@/schemas/record.schema";
import apiErrorHandler from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: DELIVERY_ERROR_MESSAGES.LA_SOLICITUD_NO_PERTENECE_A_ESTE_SITIO });
    }

    const user = await requireRecordWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const body = await request.json().catch(() => null);
    const parsedInput = beneficiarySheetSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json({ error: { message: DELIVERY_ERROR_MESSAGES.SELECCIONA_AL_MENOS_UN_BENEFICIARIO_VALIDO, details: parsedInput.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    }

    const sheet = await issueBeneficiarySheet({ ...parsedInput.data, userId: user.id });

    return NextResponse.json({ sheet }, { status: 201, headers: privateHeaders });
  } catch (error) {
    let apiError = new ApiError({ status: 500, message: DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_EMITIR_LA_PLANILLA, isOperational: false });

    if (error instanceof ApiError) {
      apiError = error;
    }
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_EMITIR_LA_PLANILLA });
    response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
    return response;
  }
}
