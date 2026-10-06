import {
  Archive01Icon,
  DocumentValidationIcon,
  PackageIcon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { ROUTES } from "@/constants/routes";

export const DASHBOARD_SNAPSHOT = {
  distributionDate: "15/09/2026",
  period: "Septiembre 2026",
  site: "Comedor San Cayetano",
  approvedModules: 80,
} as const;

export const DASHBOARD_STAGES = [
  {
    title: "Solicitud de Módulos",
    description: "Aprobada por Coordinación General",
    detail: "80 cupos",
    status: "completed",
  },
  {
    title: "Mercadería Recibida",
    description: "Remito #00489 cotejado y archivado",
    detail: "Verificado",
    status: "completed",
  },
  {
    title: "Registro de Entrega",
    description: "Formulario disponible para el operativo",
    detail: "Disponible",
    status: "current",
  },
  {
    title: "Rendición de Carga",
    description: "Documentación del período en preparación",
    detail: "Pendiente",
    status: "pending",
  },
] as const;

export const DASHBOARD_METRICS = [
  { label: "Familias", value: "128", description: "Registradas", icon: UserGroupIcon },
  { label: "Personas", value: "246", description: "Beneficiarios activos", icon: UserMultipleIcon },
  { label: "Módulos", value: "80", description: "Cupos aprobados", icon: Archive01Icon },
  { label: "Rendiciones", value: "3", description: "Pendientes de cierre", icon: DocumentValidationIcon },
] as const;

export const DASHBOARD_ACTIONS = [
  { label: "+ Familia", description: "Nuevo legajo", href: ROUTES.FAMILIES, icon: UserGroupIcon },
  { label: "+ Beneficiario", description: "Titular o menor", href: ROUTES.FAMILIES, icon: UserMultipleIcon },
  { label: "+ Solicitud", description: "Pedido de módulos", href: ROUTES.GOODS, icon: PackageIcon },
  { label: "+ Recepción", description: "Cargar remito", href: ROUTES.GOODS, icon: Archive01Icon },
] as const;

export const DASHBOARD_ACTIVITY = [
  {
    name: "María G.",
    action: "actualizó el legajo de Familia Gómez",
    detail: "Datos de contacto revisados",
    time: "hace 4 min",
    image: "/images/profile.jpg",
  },
  {
    name: "Lucía M.",
    action: "ingresó el remito #00489",
    detail: "Despensa Central",
    time: "hace 45 min",
    image: "/images/warehouse-manager.jpg",
  },
  {
    name: "Juan Ignacio Pérez",
    action: "fue dado de alta como titular",
    detail: "3 integrantes a cargo",
    time: "hace 2 horas",
    image: "",
  },
] as const;
