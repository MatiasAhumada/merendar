

import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { userService } from "@/server/services/user.service";
import { requireAdministrativeCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";
import { updateUserStatusRequestSchema } from "@/schemas/user.schema";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "users.manage", USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_USUARIOS);
    const input = updateUserStatusRequestSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { message: USER_ERROR_MESSAGES.INDICA_UN_ESTADO_VALIDO, details: input.error.flatten().fieldErrors } }, { status: 400 });
    const { id } = await params;
    await userService.updateStatus(id, user.id, input.data.isActive);
    return new NextResponse(null, { status: 204, headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: USER_ERROR_MESSAGES.NO_SE_PUDO_ACTUALIZAR_EL_USUARIO, isOperational: false }), request });
  }
}
