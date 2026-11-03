import { AUTH } from "@/constants/auth.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { merchandiseRequestDocumentPayloadSchema } from "@/schemas/merchandise-request-document.schema";
import { requireMerchandiseWriteAccess } from "@/server/services/merchandise-access";
import { issueMerchandiseRequestDocument } from "@/server/services/merchandise-request-document.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const issuer = await requireMerchandiseWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const { id } = await context.params;
    const body: unknown = await request.json();
    const parsedPayload = merchandiseRequestDocumentPayloadSchema.safeParse(body);
    if (!parsedPayload.success) {
      throw new ApiError({ status: 400, message: "Revisá los datos del borrador de solicitud." });
    }
    const payload = parsedPayload.data;
    if (payload.requestId !== id) {
      throw new ApiError({ status: 400, message: "La solicitud no coincide con el documento." });
    }
    const document = await issueMerchandiseRequestDocument(payload, issuer.id);
    return NextResponse.json({ document }, { status: 201, headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let apiError = new ApiError({ status: 500, message: "No se pudo generar el borrador de la solicitud.", isOperational: false });
    if (error instanceof ApiError) {
      apiError = error;
    }
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudo generar el borrador de la solicitud." });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
