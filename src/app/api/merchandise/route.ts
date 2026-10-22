import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { merchandiseRepository } from "@/server/repository/merchandise.repository";
import { requireMerchandiseReadAccess } from "@/server/services/merchandise-access";
import { authService } from "@/server/services/auth.service";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH.SESSION_COOKIE)?.value;
    const session = await authService.getSession(token);
    if (!session) {
      throw new ApiError({ status: 401, message: "Iniciá sesión para consultar mercadería" });
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
      : new ApiError({ status: 500, message: "No se pudo consultar la recepción de mercadería", isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo consultar la recepción de mercadería" });
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  }
}
