

import { PRIVATE_RESPONSE_HEADERS, HTTP_CACHE_CONTROL, HTTP_HEADERS } from "@/constants/http.constant";
import { DASHBOARD_ERROR_MESSAGES } from "@/constants/dashboard.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { dashboardService } from "@/server/services/dashboard.service";
import { requireCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

export async function GET(request: NextRequest) {
  try {
    const user = await requireCapability(
      request.cookies.get(AUTH.SESSION_COOKIE)?.value,
      "dashboard.metrics.read",
      DASHBOARD_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_EL_RESUMEN,
      DASHBOARD_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_CONSULTAR_LAS_METRICAS_DEL_INICIO,
    );
    const result = await dashboardService.getSummary(user.role);

    if (!result.authorized) {
      throw new ApiError({ status: 403, message: DASHBOARD_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_CONSULTAR_LAS_METRICAS_DEL_INICIO });
    }

    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError({ status: 500, message: DASHBOARD_ERROR_MESSAGES.NO_SE_PUDO_CARGAR_EL_RESUMEN_DEL_INICIO, isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: DASHBOARD_ERROR_MESSAGES.NO_SE_PUDO_CARGAR_EL_RESUMEN_DEL_INICIO });
    response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
    return response;
  }
}
