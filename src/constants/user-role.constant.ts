import type { UserRole } from "@prisma/client";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PRESIDENTE: "Presidencia",
  SECRETARIA: "Secretaría",
  TESORERIA: "Tesorería",
  VOCALIA: "Vocalía",
  REVISION_CUENTAS: "Revisión de cuentas",
};
