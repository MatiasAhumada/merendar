import { AUTH } from "@/constants/auth.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { participantVerificationUpdateSchema } from "@/schemas/record.schema";
import { requireRecordWriteAccess } from "@/server/services/record-access";
import { updateDistributionParticipantVerifications } from "@/server/services/distribution-participant.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/records/distribution-participants/[id]">) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio." });
    }
    await requireRecordWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const parsedUpdate = participantVerificationUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsedUpdate.success) {
      throw new ApiError({ status: 400, message: "Las comprobaciones del participante no son válidas." });
    }
    const { id } = await context.params;
    const participant = await updateDistributionParticipantVerifications({ participantId: id, ...parsedUpdate.data });
    return NextResponse.json({ participant }, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let apiError = new ApiError({ status: 500, message: "No se pudieron actualizar las comprobaciones del participante.", isOperational: false });
    if (error instanceof ApiError) apiError = error;
    return apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudieron actualizar las comprobaciones del participante." });
  }
}
