import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { merchandiseRepository } from "@/server/repository/merchandise.repository";
import { requireMerchandiseAccess } from "@/server/services/merchandise-access";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest) {
  try {
    await requireMerchandiseAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const periods = await merchandiseRepository.findAll();
    return NextResponse.json({ periods }, { headers: privateHeaders });
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError({ status: 500, message: "No se pudo consultar la recepción de mercadería", isOperational: false });
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo consultar la recepción de mercadería" });
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  }
}
