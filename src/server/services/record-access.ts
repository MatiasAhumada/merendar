import { UserRole } from "@prisma/client";
import { authService } from "@/server/services/auth.service";
import { ApiError } from "@/utils/handlers/apiError.handler";

const recordRoles: UserRole[] = [UserRole.PRESIDENTE, UserRole.SECRETARIA];

export async function requireRecordAccess(token: string | undefined) {
  const session = await authService.getSession(token);

  if (!session) {
    throw new ApiError({ status: 401, message: "Iniciá sesión para consultar los registros" });
  }

  if (!recordRoles.includes(session.user.role)) {
    throw new ApiError({ status: 403, message: "Solo presidencia y secretaría pueden registrar módulos" });
  }

  return session.user;
}
