import { PRIVATE_DOCUMENT_RESPONSE_HEADERS } from "@/constants/http.constant";
import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { requireRenditionReadAccess } from "@/server/services/merchandise-access";
import { getRenditionDocument } from "@/server/services/rendition.service";
import { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_DOCUMENT_RESPONSE_HEADERS;

export async function GET(request: NextRequest, context: RouteContext<"/api/renditions/documents/[id]">) {
  try {
    await requireRenditionReadAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await context.params;
    const document = await getRenditionDocument(id);

    if (!document) {
      return NextResponse.json({ error: { message: RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_DOCUMENTO_SOLICITADO } }, { status: 404, headers: privateHeaders });
    }

    const disposition = request.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";

    return new NextResponse(document.content, {
      headers: {
        ...privateHeaders,
        "Content-Type": document.contentType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : RENDITION_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_EL_DOCUMENTO;
    return NextResponse.json({ error: { message } }, { status, headers: privateHeaders });
  }
}
