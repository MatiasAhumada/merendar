

import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { userService } from "@/server/services/user.service";
import { requireAdministrativeCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { normalizeApiError } from "@/utils/handlers/apiError.handler";
import { createUserRequestSchema } from "@/schemas/user.schema";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

async function requireUserAdministration(request: NextRequest) {
  return requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "users.manage", USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_USUARIOS);
}

export async function GET(request: NextRequest) {
  try {
    await requireUserAdministration(request);
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    return NextResponse.json({ users: await userService.findAll(search) }, { headers: privateHeaders });
  } catch (error) {
    const apiError = normalizeApiError(error, 500, USER_ERROR_MESSAGES.NO_SE_PUDIERON_CARGAR_LOS_USUARIOS);
    return apiErrorHandler({ error: apiError, request });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUserAdministration(request);
    const input = createUserRequestSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { message: USER_ERROR_MESSAGES.REVISA_LOS_CAMPOS_DEL_FORMULARIO, details: input.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    const created = await userService.create(input.data);
    return NextResponse.json({ user: { id: created.id, name: created.name, email: created.email, role: created.role, isActive: created.isActive } }, { status: 201, headers: privateHeaders });
  } catch (error) {
    const apiError = normalizeApiError(error, 500, USER_ERROR_MESSAGES.NO_SE_PUDO_CREAR_EL_USUARIO);
    return apiErrorHandler({ error: apiError, request });
  }
}
