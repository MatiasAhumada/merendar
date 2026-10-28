

import { USER_ERROR_MESSAGES, USER_VALIDATION_MESSAGES } from "@/constants/user.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { userService } from "@/server/services/user.service";
import { requireAdministrativeCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const createSchema = z.object({
  name: z.string().trim().min(2, USER_VALIDATION_MESSAGES.NAME_INVALID).max(120),
  email: z.email(USER_VALIDATION_MESSAGES.EMAIL_INVALID).transform((email) => email.trim().toLowerCase()),
  role: z.enum(UserRole),
  password: z.string().min(10, USER_VALIDATION_MESSAGES.PASSWORD_MIN_LENGTH).max(128),
}).strict();
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
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: USER_ERROR_MESSAGES.NO_SE_PUDIERON_CARGAR_LOS_USUARIOS, isOperational: false }), request });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUserAdministration(request);
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { message: USER_ERROR_MESSAGES.REVISA_LOS_CAMPOS_DEL_FORMULARIO, details: input.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    const created = await userService.create(input.data);
    return NextResponse.json({ user: { id: created.id, name: created.name, email: created.email, role: created.role, isActive: created.isActive } }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: USER_ERROR_MESSAGES.NO_SE_PUDO_CREAR_EL_USUARIO, isOperational: false }), request });
  }
}
