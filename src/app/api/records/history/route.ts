import { AUTH } from "@/constants/auth.constant";
import { HTTP_CACHE_CONTROL, HTTP_HEADERS, PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { requireRecordReadAccess } from "@/server/services/record-access";
import { recordHistoryQuerySchema } from "@/schemas/record-history.schema";
import { getRecordHistory } from "@/server/services/record-history.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireRecordReadAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const queryEntries = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsedFilters = recordHistoryQuerySchema.safeParse(queryEntries);
    if (!parsedFilters.success) {
      throw new ApiError({ status: 400, message: parsedFilters.error.issues[0]?.message ?? "Los filtros del historial no son válidos." });
    }

    const history = await getRecordHistory(parsedFilters.data);
    return NextResponse.json(history, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let apiError = new ApiError({ status: 500, message: "No se pudo consultar el historial de entregas.", isOperational: false });
    if (error instanceof ApiError) apiError = error;
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo consultar el historial de entregas." });
    response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
    return response;
  }
}
