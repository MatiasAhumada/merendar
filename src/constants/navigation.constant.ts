import { ACCESS_CAPABILITY_KEYS, RESERVED_ACCESS_CAPABILITIES } from "@/constants/access-policy.constant";
import { ROUTES } from "@/constants/routes.constant";
import {
  DashboardSquare01Icon,
  PackageIcon,
  UserGroupIcon,
  DocumentValidationIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";

export const NAVIGATION_LABELS = {
  HOME: "Inicio",
  FAMILIES: "Familias",
  DELIVERY: "Registro",
  GOODS: "Módulos",
  USERS: "Usuarios",
  ACCESS_POLICY: "Permisos",
} as const;

export const PRIMARY_NAVIGATION = [
  { href: ROUTES.HOME, label: NAVIGATION_LABELS.HOME, icon: DashboardSquare01Icon, capabilities: null },
  { href: ROUTES.FAMILIES, label: NAVIGATION_LABELS.FAMILIES, icon: UserGroupIcon, capabilities: [ACCESS_CAPABILITY_KEYS.FAMILIES_READ] },
  { href: ROUTES.DELIVERY, label: NAVIGATION_LABELS.DELIVERY, icon: DocumentValidationIcon, capabilities: [ACCESS_CAPABILITY_KEYS.DELIVERY_READ] },
  { href: ROUTES.GOODS, label: NAVIGATION_LABELS.GOODS, icon: PackageIcon, capabilities: [ACCESS_CAPABILITY_KEYS.MERCHANDISE_READ, ACCESS_CAPABILITY_KEYS.RENDITIONS_READ] },
  { href: ROUTES.USERS, label: NAVIGATION_LABELS.USERS, icon: UserAdd01Icon, capabilities: [RESERVED_ACCESS_CAPABILITIES.USERS_MANAGE] },
  { href: ROUTES.ACCESS_POLICY, label: NAVIGATION_LABELS.ACCESS_POLICY, icon: UserAdd01Icon, capabilities: [RESERVED_ACCESS_CAPABILITIES.ACCESS_POLICY_MANAGE] },
] as const;
