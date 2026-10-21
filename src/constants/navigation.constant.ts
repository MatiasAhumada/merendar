import {
  DashboardSquare01Icon,
  PackageIcon,
  UserGroupIcon,
  DocumentValidationIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { ROUTES } from "@/constants/routes";

export const PRIMARY_NAVIGATION = [
  { href: ROUTES.HOME, label: "Inicio", icon: DashboardSquare01Icon, capabilities: null },
  { href: ROUTES.FAMILIES, label: "Familias", icon: UserGroupIcon, capabilities: ["families.read"] },
  { href: ROUTES.DELIVERY, label: "Registro", icon: DocumentValidationIcon, capabilities: ["delivery.read"] },
  { href: ROUTES.GOODS, label: "Módulos", icon: PackageIcon, capabilities: ["merchandise.read", "renditions.read"] },
  { href: ROUTES.USERS, label: "Usuarios", icon: UserAdd01Icon, capabilities: ["users.manage"] },
  { href: ROUTES.ACCESS_POLICY, label: "Permisos", icon: UserAdd01Icon, capabilities: ["access-policy.manage"] },
] as const;
