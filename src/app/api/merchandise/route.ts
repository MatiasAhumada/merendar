

import { PRIVATE_RESPONSE_HEADERS, HTTP_CACHE_CONTROL, HTTP_HEADERS } from "@/constants/http.constant";
import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { getVisibleMerchandisePeriods } from "@/server/services/merchandise.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH.SESSION_COOKIE)?.value;
    const periods = await getVisibleMerchandisePeriods(token);
    return NextResponse.json({ periods }, { headers: privateHeaders });
  } catch (error) {
    let apiError = new ApiError({ status: 500, message: MERCHANDISE_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_LA_RECEPCION_DE_MERCADERIA, isOperational: false });

    if (error instanceof ApiError) {
      apiError = error;
    }
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: MERCHANDISE_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_LA_RECEPCION_DE_MERCADERIA });
    response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
    return response;
  }
}
