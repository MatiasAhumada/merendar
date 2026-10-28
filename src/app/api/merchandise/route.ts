

import { PRIVATE_RESPONSE_HEADERS, HTTP_CACHE_CONTROL, HTTP_HEADERS } from "@/constants/http.constant";
import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { merchandiseRepository } from "@/server/repository/merchandise.repository";
import { requireMerchandiseReadAccess } from "@/server/services/merchandise-access";
import { authService } from "@/server/services/auth.service";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH.SESSION_COOKIE)?.value;
    const session = await authService.getSession(token);
    if (!session) {
      throw new ApiError({ status: 401, message: MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_MERCADERIA });
    }
    const canReadMerchandise = await hasEffectiveCapability(session.user.role, "merchandise.read");
    const canReadRenditions = await hasEffectiveCapability(session.user.role, "renditions.read");

    if (!canReadMerchandise && !canReadRenditions) {
      await requireMerchandiseReadAccess(token);
    }

    const periods = await merchandiseRepository.findAll();
    const visiblePeriods = periods.map((period) => {
      let requests = period.requests;
      let renditions = period.renditions;
      if (!canReadMerchandise) {
        requests = [];
      }
      if (!canReadRenditions) {
        renditions = [];
      }
      return { ...period, requests, renditions };
    });
    return NextResponse.json({ periods: visiblePeriods }, { headers: privateHeaders });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError({ status: 500, message: MERCHANDISE_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_LA_RECEPCION_DE_MERCADERIA, isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: MERCHANDISE_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_LA_RECEPCION_DE_MERCADERIA });
    response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
    return response;
  }
}
