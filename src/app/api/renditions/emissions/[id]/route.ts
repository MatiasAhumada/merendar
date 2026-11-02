import { PRIVATE_DOCUMENT_RESPONSE_HEADERS } from "@/constants/http.constant";
import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import { requireRenditionReadAccess } from "@/server/services/merchandise-access";
import { getRenditionEmissionFile } from "@/server/services/rendition.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, context: RouteContext<"/api/renditions/emissions/[id]">) {
  try {
    await requireRenditionReadAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await context.params;
    const kind = request.nextUrl.searchParams.get("kind");

    if (kind !== "note" && kind !== "summary" && kind !== "package") {
      return NextResponse.json({ error: { message: RENDITION_ERROR_MESSAGES.REVISA_EL_TIPO_DE_ARCHIVO_SOLICITADO } }, { status: 400, headers: PRIVATE_DOCUMENT_RESPONSE_HEADERS });
    }

    const file = await getRenditionEmissionFile(id, kind);
    if (!file) {
      return NextResponse.json({ error: { message: RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_DOCUMENTO_SOLICITADO } }, { status: 404, headers: PRIVATE_DOCUMENT_RESPONSE_HEADERS });
    }

    return new NextResponse(file.content, {
      headers: {
        ...PRIVATE_DOCUMENT_RESPONSE_HEADERS,
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      },
    });
  } catch (error) {
    let status = 500;
    let message: string = RENDITION_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_EL_DOCUMENTO;
    if (error instanceof ApiError) {
      status = error.status;
      message = error.message;
    }
    return NextResponse.json({ error: { message } }, { status, headers: PRIVATE_DOCUMENT_RESPONSE_HEADERS });
  }
}
import { AUTH } from "@/constants/auth.constant";
