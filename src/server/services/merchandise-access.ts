import { UserRole } from "@prisma/client";
import { authService } from "@/server/services/auth.service";
import { ApiError } from "@/utils/handlers/apiError.handler";

export const MERCHANDISE_WRITE_ROLES: UserRole[] = [UserRole.PRESIDENTE, UserRole.SECRETARIA];

export async function requireMerchandiseAccess(token: string | undefined) {
  const session = await authService.getSession(token);

  if (!session) {
    throw new ApiError({ status: 401, message: "Iniciá sesión para consultar la recepción de mercadería" });
  }

  if (!MERCHANDISE_WRITE_ROLES.includes(session.user.role)) {
    throw new ApiError({ status: 403, message: "Solo presidencia y secretaría pueden gestionar la recepción de mercadería" });
  }

  return session.user;
}
