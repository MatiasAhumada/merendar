import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { requireRenditionReviewAccess } from "@/server/services/merchandise-access";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { renditionReviewPayloadSchema } from "@/validations/rendition.validation";

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
    const existingRendition = await prisma.rendition.findUnique({ where: { id }, select: { id: true } });

    if (!existingRendition) {
      throw new ApiError({ status: 404, message: RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA });
    }

    const signedSheetCount = await prisma.renditionDocument.count({ where: { renditionId: id, documentType: "PLANILLA_FIRMADA", supersededBy: { none: {} } } });

    if (!signedSheetCount) {
      throw new ApiError({ status: 409, message: RENDITION_ERROR_MESSAGES.ADJUNTA_UNA_PLANILLA_FIRMADA_VIGENTE_ANTES_DE_REVISAR_LA_RENDICION });
    }

    const rendition = await prisma.rendition.update({
      where: { id },
      data: {
        reviewStatus: review.data.status,
        reviewNotes: review.data.notes ?? null,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
      select: { id: true, reviewStatus: true, reviewNotes: true, reviewedAt: true },
    });

    return NextResponse.json({ rendition }, { headers: privateHeaders });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : RENDITION_ERROR_MESSAGES.NO_SE_PUDO_REGISTRAR_LA_REVISION_DOCUMENTAL;
    return NextResponse.json({ error: { message } }, { status, headers: privateHeaders });
  }
}
