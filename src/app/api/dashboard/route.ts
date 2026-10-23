import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { dashboardService } from "@/server/services/dashboard.service";
import { requireCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest) {
  try {
    const user = await requireCapability(
      request.cookies.get(AUTH.SESSION_COOKIE)?.value,
      "dashboard.metrics.read",
      "Iniciá sesión para consultar el resumen",
      "No tenés permiso para consultar las métricas del inicio",
    );
    const result = await dashboardService.getSummary(user.role);

    if (!result.authorized) {
      throw new ApiError({ status: 403, message: "No tenés permiso para consultar las métricas del inicio" });
    }

    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError({ status: 500, message: "No se pudo cargar el resumen del inicio", isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo cargar el resumen del inicio" });
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  }
}
