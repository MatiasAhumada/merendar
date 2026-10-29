import { OFFLINE_OPERATION_MESSAGES } from "@/constants/offline.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { processSynchronizationRequest } from "@/server/services/synchronization-request.service";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "invalid_origin", OFFLINE_OPERATION_MESSAGES.LA_SOLICITUD_NO_PERTENECE_A_ESTE_SITIO);
  }

  const session = await authService.getSession(request.cookies.get(AUTH.SESSION_COOKIE)?.value);

  if (!session) {
    return errorResponse(401, "session_expired", OFFLINE_OPERATION_MESSAGES.LA_SESION_VENCIO_INICIA_SESION_PARA_SINCRONIZAR_LOS_CAMBIOS_PENDIENTES);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_body", OFFLINE_OPERATION_MESSAGES.EL_CUERPO_DE_LA_OPERACION_NO_ES_VALIDO);
  }

  const result = await processSynchronizationRequest(session.user.id, session.user.role, body);
  return NextResponse.json(result.body, { status: result.status, headers: privateHeaders });
}
