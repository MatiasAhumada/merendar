import {
  Archive01Icon,
  DocumentValidationIcon,
  PackageIcon,
  UserAdd01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { UserRole } from "@prisma/client";
import { ROUTES } from "@/constants/routes";

export const DASHBOARD_METRICS = [
  { label: "Familias", description: "En el padrón", icon: UserGroupIcon },
  { label: "Personas", description: "Integrantes registrados", icon: UserMultipleIcon },
  { label: "Cupos aprobados", description: "Período vigente", icon: Archive01Icon },
] as const;

export const DASHBOARD_ACTIONS = [
  {
    label: "Padrón familiar",
    description: "Consultar familias",
    href: ROUTES.FAMILIES,
    icon: UserGroupIcon,
    roles: [UserRole.PRESIDENTE, UserRole.SECRETARIA],
  },
  {
    label: "Registro de beneficiarios",
    description: "Planillas para firma manual",
    href: ROUTES.DELIVERY,
    icon: DocumentValidationIcon,
    roles: [UserRole.PRESIDENTE, UserRole.SECRETARIA],
  },
  {
    label: "Solicitudes y cupos",
    description: "Consultar módulos",
    href: ROUTES.GOODS,
    icon: PackageIcon,
    roles: [UserRole.PRESIDENTE, UserRole.SECRETARIA],
  },
  {
    label: "Recepciones y remitos",
    description: "Consultar mercadería",
    href: ROUTES.GOODS,
    icon: Archive01Icon,
    roles: [UserRole.PRESIDENTE, UserRole.SECRETARIA],
  },
  {
    label: "Administrar usuarios",
    description: "Cuentas y permisos",
    href: ROUTES.USERS,
    icon: UserAdd01Icon,
    roles: [UserRole.PRESIDENTE],
  },
] as const;
