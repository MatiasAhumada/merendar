import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";
import { userService } from "@/server/services/user.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const statusSchema = z.object({ isActive: z.boolean() }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authService.getSession(request.cookies.get(AUTH.SESSION_COOKIE)?.value);
    if (!session) throw new ApiError({ status: 401, message: "Iniciá sesión para continuar" });
    if (session.user.role !== "PRESIDENTE") throw new ApiError({ status: 403, message: "No tenés permiso para administrar usuarios" });
    const input = statusSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: { message: "Indicá un estado válido", details: input.error.flatten().fieldErrors } }, { status: 400 });
    const { id } = await params;
    await userService.updateStatus(id, session.user.id, input.data.isActive);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: "No se pudo actualizar el usuario", isOperational: false }), request });
  }
}
