

import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { getAccessPolicyManagement, requireAdministrativeCapability, saveAccessPolicy } from "@/server/services/access-policy.service";
import apiErrorHandler, { normalizeApiError } from "@/utils/handlers/apiError.handler";
import { updateAccessPolicyRequestSchema } from "@/schemas/access-policy.schema";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

export async function GET(request: NextRequest) {
  try {
    await requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "access-policy.manage", USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_PERMISOS);
    const management = await getAccessPolicyManagement();
    return NextResponse.json(management, { headers: privateHeaders });
  } catch (error) {
    const apiError = normalizeApiError(error, 500, USER_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_LA_POLITICA_DE_PERMISOS);
    return apiErrorHandler({ error: apiError, request });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "access-policy.manage", USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_PERMISOS);
    const parsedBody = updateAccessPolicyRequestSchema.safeParse(await request.json());

    if (!parsedBody.success) {
      return NextResponse.json({ error: { message: USER_ERROR_MESSAGES.LA_MATRIZ_DEBE_INCLUIR_UNA_SOLA_CONFIGURACION_COMPLETA_POR_ROL } }, { status: 400, headers: privateHeaders });
    }

    await saveAccessPolicy(actor.id, parsedBody.data.roles);
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) {
    const apiError = normalizeApiError(error, 409, USER_ERROR_MESSAGES.NO_SE_PUDIERON_GUARDAR_LOS_PERMISOS_VOLVE_A_CARGAR_LA_MATRIZ_E_INTENTA);
    return apiErrorHandler({ error: apiError, request });
  }
}
