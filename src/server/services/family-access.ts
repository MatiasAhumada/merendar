import { UserRole } from "@prisma/client";
import { authService } from "@/server/services/auth.service";
import { ApiError } from "@/utils/handlers/apiError.handler";

export const FAMILY_WRITE_ROLES: UserRole[] = [UserRole.PRESIDENTE, UserRole.SECRETARIA];

export async function requireFamilyAccess(token: string | undefined) {
  const session = await authService.getSession(token);

  if (!session) {
    throw new ApiError({ status: 401, message: "Iniciá sesión para consultar el padrón" });
  }

  if (!FAMILY_WRITE_ROLES.includes(session.user.role)) {
    throw new ApiError({ status: 403, message: "No tenés permiso para acceder al padrón familiar" });
  }

  return session.user;
}
