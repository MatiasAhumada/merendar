import {
  Clock01Icon,
  DashboardSquare01Icon,
  PackageIcon,
  UserGroupIcon,
  DocumentValidationIcon,
} from "@hugeicons/core-free-icons";
import { ROUTES } from "@/constants/routes";

export const PRIMARY_NAVIGATION = [
  { href: ROUTES.HOME, label: "Inicio", icon: DashboardSquare01Icon },
  { href: ROUTES.FAMILIES, label: "Familias", icon: UserGroupIcon },
  { href: ROUTES.DELIVERY, label: "Entrega", icon: DocumentValidationIcon },
  { href: ROUTES.GOODS, label: "Módulos", icon: PackageIcon },
  { href: ROUTES.HISTORY, label: "Historial", icon: Clock01Icon },
] as const;
