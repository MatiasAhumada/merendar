import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { userService } from "@/server/services/user.service";
import { requireAdministrativeCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const createSchema = z.object({
  name: z.string().trim().min(2, "Ingresá un nombre válido").max(120),
  email: z.email("Ingresá un email válido").transform((email) => email.trim().toLowerCase()),
  role: z.enum(UserRole),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(128),
}).strict();
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

async function requireUserAdministration(request: NextRequest) {
  return requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "users.manage", "No tenés permiso para administrar usuarios");
}

export async function GET(request: NextRequest) {
  try {
    await requireUserAdministration(request);
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    return NextResponse.json({ users: await userService.findAll(search) }, { headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: "No se pudieron cargar los usuarios", isOperational: false }), request });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUserAdministration(request);
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { message: "Revisá los campos del formulario", details: input.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    const created = await userService.create(input.data);
    return NextResponse.json({ user: { id: created.id, name: created.name, email: created.email, role: created.role, isActive: created.isActive } }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: "No se pudo crear el usuario", isOperational: false }), request });
  }
}
