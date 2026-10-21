import {
  DashboardSquare01Icon,
  PackageIcon,
  UserGroupIcon,
  DocumentValidationIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { UserRole } from "@prisma/client";
import { ROUTES } from "@/constants/routes";

export const PRIMARY_NAVIGATION = [
  { href: ROUTES.HOME, label: "Inicio", icon: DashboardSquare01Icon, roles: Object.values(UserRole) },
  { href: ROUTES.FAMILIES, label: "Familias", icon: UserGroupIcon, roles: [UserRole.PRESIDENTE, UserRole.SECRETARIA] },
  { href: ROUTES.DELIVERY, label: "Registro", icon: DocumentValidationIcon, roles: [UserRole.PRESIDENTE, UserRole.SECRETARIA] },
  { href: ROUTES.GOODS, label: "Módulos", icon: PackageIcon, roles: [UserRole.PRESIDENTE, UserRole.SECRETARIA] },
  { href: ROUTES.USERS, label: "Usuarios", icon: UserAdd01Icon, roles: [UserRole.PRESIDENTE] },
] as const;
