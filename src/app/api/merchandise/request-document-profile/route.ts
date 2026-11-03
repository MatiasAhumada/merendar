import { AUTH } from "@/constants/auth.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { requireMerchandiseReadAccess, requireMerchandiseWriteAccess } from "@/server/services/merchandise-access";
import { getMerchandiseRequestDocumentProfile, saveMerchandiseRequestDocumentProfile } from "@/server/services/merchandise-request-document-profile.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import apiErrorHandler from "@/utils/handlers/apiError.handler";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireMerchandiseReadAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const profile = await getMerchandiseRequestDocumentProfile();
    return NextResponse.json({ profile }, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let apiError: ApiError;
    if (error instanceof ApiError) {
      apiError = error;
    } else {
      apiError = new ApiError({ status: 500, message: "No se pudieron consultar los datos de firma.", isOperational: false });
    }
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudieron consultar los datos de firma." });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireMerchandiseWriteAccess(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    const payload: unknown = await request.json();
    const profile = await saveMerchandiseRequestDocumentProfile(payload, user.id);
    return NextResponse.json({ profile }, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let apiError: ApiError;
    if (error instanceof ApiError) {
      apiError = error;
    } else {
      apiError = new ApiError({ status: 500, message: "No se pudieron guardar los datos de firma.", isOperational: false });
    }
    const response = apiErrorHandler({ error: apiError, request, fallbackMessage: "No se pudieron guardar los datos de firma." });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
