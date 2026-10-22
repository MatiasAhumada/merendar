import {
  Archive01Icon,
  DocumentValidationIcon,
  PackageIcon,
  UserAdd01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
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
    capability: "families.read",
  },
  {
    label: "Registro de beneficiarios",
    description: "Planillas para firma manual",
    href: ROUTES.DELIVERY,
    icon: DocumentValidationIcon,
    capability: "delivery.read",
  },
  {
    label: "Solicitudes y cupos",
    description: "Consultar módulos",
    href: ROUTES.GOODS,
    icon: PackageIcon,
    capability: "merchandise.read",
  },
  {
    label: "Recepciones y remitos",
    description: "Consultar mercadería",
    href: ROUTES.GOODS,
    icon: Archive01Icon,
    capability: "merchandise.read",
  },
  {
    label: "Rendición documental",
    description: "Consultar planillas y documentos",
    href: ROUTES.GOODS,
    icon: Archive01Icon,
    capability: "renditions.read",
  },
  {
    label: "Administrar usuarios",
    description: "Cuentas y permisos",
    href: ROUTES.USERS,
    icon: UserAdd01Icon,
    capability: "users.manage",
  },
  {
    label: "Administrar permisos",
    description: "Configurar capacidades por rol",
    href: ROUTES.ACCESS_POLICY,
    icon: UserAdd01Icon,
    capability: "access-policy.manage",
  },
] as const;
