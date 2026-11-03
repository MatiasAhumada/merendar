import type { UserRole } from "@prisma/client";

export const USER_ROLES = {
  PRESIDENTE: "PRESIDENTE",
  SECRETARIA: "SECRETARIA",
  TESORERIA: "TESORERIA",
  VOCALIA: "VOCALIA",
  REVISION_CUENTAS: "REVISION_CUENTAS",
} as const satisfies Record<string, UserRole>;

export const USER_ROLE_OPTIONS = [
  USER_ROLES.PRESIDENTE,
  USER_ROLES.SECRETARIA,
  USER_ROLES.TESORERIA,
  USER_ROLES.VOCALIA,
  USER_ROLES.REVISION_CUENTAS,
] as const satisfies readonly UserRole[];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  PRESIDENTE: "Presidencia",
  SECRETARIA: "Secretaría",
  TESORERIA: "Tesorería",
  VOCALIA: "Vocalía",
  REVISION_CUENTAS: "Revisión de cuentas",
};
