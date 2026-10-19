import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";
import { userService } from "@/server/services/user.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const createSchema = z.object({
  name: z.string().trim().min(2, "Ingresá un nombre válido").max(120),
  email: z.email("Ingresá un email válido").transform((email) => email.trim().toLowerCase()),
  role: z.enum(UserRole),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(128),
}).strict();
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

async function requirePresident(request: NextRequest) {
  const session = await authService.getSession(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
  if (!session) throw new ApiError({ status: 401, message: "Iniciá sesión para continuar" });
  if (session.user.role !== UserRole.PRESIDENTE) throw new ApiError({ status: 403, message: "No tenés permiso para administrar usuarios" });
  return session.user;
}

export async function GET(request: NextRequest) {
  try {
    await requirePresident(request);
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    return NextResponse.json({ users: await userService.findAll(search) }, { headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: "No se pudieron cargar los usuarios", isOperational: false }), request });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePresident(request);
    const input = createSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { message: "Revisá los campos del formulario", details: input.error.flatten().fieldErrors } }, { status: 400, headers: privateHeaders });
    const created = await userService.create(input.data);
    return NextResponse.json({ user: { id: created.id, name: created.name, email: created.email, role: created.role, isActive: created.isActive } }, { status: 201, headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: "No se pudo crear el usuario", isOperational: false }), request });
  }
}
