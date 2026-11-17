import { AUTH } from "@/constants/auth.constant";
import { PRIVATE_RESPONSE_HEADERS, HTTP_HEADERS, HTTP_CACHE_CONTROL } from "@/constants/http.constant";
import { requireRecordWriteAccess } from "@/server/services/record-access";
import { changeDistributionEventStatus } from "@/server/services/distribution-event.service";
import { distributionEventStatusChangeSchema } from "@/schemas/distribution-event.schema";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/records/distribution-events/[id]/status">) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio." });
    }
    await requireRecordWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await context.params;
    const parsedChange = distributionEventStatusChangeSchema.safeParse(await request.json().catch(() => null));
    if (!parsedChange.success) {
      throw new ApiError({ status: 400, message: "La transición de estado no es válida." });
    }
    const event = await changeDistributionEventStatus({ eventId: id, ...parsedChange.data });
    return NextResponse.json({ event }, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let apiError = new ApiError({ status: 500, message: "No se pudo actualizar el estado de la jornada.", isOperational: false });
    if (error instanceof ApiError) apiError = error;
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo actualizar el estado de la jornada." });
    response.headers.set(HTTP_HEADERS.CACHE_CONTROL, HTTP_CACHE_CONTROL.PRIVATE_NO_STORE);
    return response;
  }
}
