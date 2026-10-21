import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { requireMerchandiseAccess } from "@/server/services/merchandise-access";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { renditionReviewPayloadSchema } from "@/validations/rendition.validation";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function PATCH(request: NextRequest, context: RouteContext<"/api/renditions/[id]/review">) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new ApiError({ status: 403, message: "La solicitud no pertenece a este sitio." });
    }

    const user = await requireMerchandiseAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const body: unknown = await request.json().catch(() => null);
    const review = renditionReviewPayloadSchema.safeParse(body);

    if (!review.success) {
      return NextResponse.json({ error: { message: review.error.issues[0]?.message ?? "Revisá los datos de la revisión." } }, { status: 400, headers: privateHeaders });
    }

    const { id } = await context.params;
    const existingRendition = await prisma.rendition.findUnique({ where: { id }, select: { id: true } });

    if (!existingRendition) {
      throw new ApiError({ status: 404, message: "No encontramos la rendición seleccionada." });
    }

    const signedSheetCount = await prisma.renditionDocument.count({ where: { renditionId: id, documentType: "PLANILLA_FIRMADA", supersededBy: { none: {} } } });

    if (!signedSheetCount) {
      throw new ApiError({ status: 409, message: "Adjuntá una planilla firmada vigente antes de revisar la rendición." });
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
    const message = error instanceof ApiError ? error.message : "No se pudo registrar la revisión documental.";
    return NextResponse.json({ error: { message } }, { status, headers: privateHeaders });
  }
}
