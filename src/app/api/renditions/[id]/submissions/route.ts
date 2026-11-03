import { AUTH } from "@/constants/auth.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import { renditionSubmissionPayloadSchema } from "@/schemas/rendition.schema";
import { requireRenditionWriteAccess } from "@/server/services/merchandise-access";
import { createRenditionSubmission } from "@/server/services/rendition.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, context: RouteContext<"/api/renditions/[id]/submissions">) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: RENDITION_ERROR_MESSAGES.LA_SOLICITUD_NO_PERTENECE_A_ESTE_SITIO });
    }

    const user = await requireRenditionWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const body: unknown = await request.json().catch(() => null);
    const parsedPayload = renditionSubmissionPayloadSchema.safeParse(body);
    const { id } = await context.params;

    if (!parsedPayload.success) {
      return NextResponse.json({ error: { message: RENDITION_ERROR_MESSAGES.REVISA_LOS_DATOS_DE_LA_PRESENTACION } }, { status: 400, headers: PRIVATE_RESPONSE_HEADERS });
    }

    const submission = await createRenditionSubmission({ renditionId: id, userId: user.id, payload: parsedPayload.data });
    return NextResponse.json({ submission }, { status: 201, headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let status = 500;
    let message: string = RENDITION_ERROR_MESSAGES.NO_SE_PUDO_REGISTRAR_LA_PRESENTACION_MANUAL;
    if (error instanceof ApiError) {
      status = error.status;
      message = error.message;
    }
    return NextResponse.json({ error: { message } }, { status, headers: PRIVATE_RESPONSE_HEADERS });
  }
}
