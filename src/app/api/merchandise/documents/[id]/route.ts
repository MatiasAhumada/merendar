import { PRIVATE_DOCUMENT_RESPONSE_HEADERS } from "@/constants/http.constant";
import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { getMerchandiseDocument } from "@/server/services/merchandise.service";
import { requireMerchandiseReadAccess } from "@/server/services/merchandise-access";
import { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = PRIVATE_DOCUMENT_RESPONSE_HEADERS;

export async function GET(request: NextRequest, context: RouteContext<"/api/merchandise/documents/[id]">) {
  try {
    await requireMerchandiseReadAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await context.params;
    const document = await getMerchandiseDocument(id);

    if (!document) {
      return NextResponse.json({ error: { message: MERCHANDISE_ERROR_MESSAGES.NO_ENCONTRAMOS_EL_COMPROBANTE_SOLICITADO } }, { status: 404, headers: privateHeaders });
    }

    return new NextResponse(document.content, {
      headers: {
        ...privateHeaders,
        "Content-Type": document.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      },
    });
  } catch (error) {
    let status = 500;
    let message: string = MERCHANDISE_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_EL_COMPROBANTE;

    if (error instanceof ApiError) {
      status = error.status;
      message = error.message;
    }
    return NextResponse.json({ error: { message } }, { status, headers: privateHeaders });
  }
}
