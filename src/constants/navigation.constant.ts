import {
  DashboardSquare01Icon,
  PackageIcon,
  UserGroupIcon,
  DocumentValidationIcon,
} from "@hugeicons/core-free-icons";
import { ROUTES } from "@/constants/routes";

export const PRIMARY_NAVIGATION = [
  { href: ROUTES.HOME, label: "Inicio", icon: DashboardSquare01Icon },
  { href: ROUTES.FAMILIES, label: "Familias", icon: UserGroupIcon },
  { href: ROUTES.DELIVERY, label: "Registro", icon: DocumentValidationIcon },
  { href: ROUTES.GOODS, label: "Módulos", icon: PackageIcon },
] as const;
