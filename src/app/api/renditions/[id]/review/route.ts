import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { requireRenditionReviewAccess } from "@/server/services/merchandise-access";
import { reviewRenditionDocument } from "@/server/services/rendition.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { renditionReviewPayloadSchema } from "@/schemas/rendition.schema";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

export async function PATCH(request: NextRequest, context: RouteContext<"/api/renditions/[id]/review">) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: RENDITION_ERROR_MESSAGES.LA_SOLICITUD_NO_PERTENECE_A_ESTE_SITIO });
    }

    const user = await requireRenditionReviewAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const body: unknown = await request.json().catch(() => null);
    const review = renditionReviewPayloadSchema.safeParse(body);

    if (!review.success) {
      return NextResponse.json({ error: { message: review.error.issues[0]?.message ?? RENDITION_ERROR_MESSAGES.REVISA_LOS_DATOS_DE_LA_REVISION } }, { status: 400, headers: privateHeaders });
    }

    const { id } = await context.params;
    const rendition = await reviewRenditionDocument({ id, userId: user.id, ...review.data });

    return NextResponse.json({ rendition }, { headers: privateHeaders });
  } catch (error) {
    let status = 500;
    let message: string = RENDITION_ERROR_MESSAGES.NO_SE_PUDO_REGISTRAR_LA_REVISION_DOCUMENTAL;

    if (error instanceof ApiError) {
      status = error.status;
      message = error.message;
    }
    return NextResponse.json({ error: { message } }, { status, headers: privateHeaders });
  }
}
