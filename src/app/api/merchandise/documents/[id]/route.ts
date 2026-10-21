import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { prisma } from "@/lib/prisma";
import { requireMerchandiseAccess } from "@/server/services/merchandise-access";
import { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function GET(request: NextRequest, context: RouteContext<"/api/merchandise/documents/[id]">) {
  try {
    await requireMerchandiseAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await context.params;
    const document = await prisma.merchandiseDocument.findUnique({
      where: { id },
      select: { originalName: true, contentType: true, content: true },
    });

    if (!document) {
      return NextResponse.json({ error: { message: "No encontramos el comprobante solicitado" } }, { status: 404, headers: privateHeaders });
    }

    return new NextResponse(document.content, {
      headers: {
        ...privateHeaders,
        "Content-Type": document.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : "No se pudo consultar el comprobante";
    return NextResponse.json({ error: { message } }, { status, headers: privateHeaders });
  }
}
