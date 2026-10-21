import { AccessCapability, UserRole } from "@prisma/client";

export const ACCESS_CAPABILITY_KEYS: Record<AccessCapability, string> = {
  DASHBOARD_METRICS_READ: "dashboard.metrics.read",
  FAMILIES_READ: "families.read",
  FAMILIES_WRITE: "families.write",
  DELIVERY_READ: "delivery.read",
  DELIVERY_WRITE: "delivery.write",
  MERCHANDISE_READ: "merchandise.read",
  MERCHANDISE_WRITE: "merchandise.write",
  RENDITIONS_READ: "renditions.read",
  RENDITIONS_WRITE: "renditions.write",
  RENDITIONS_REVIEW: "renditions.review",
};

export const ACCESS_CAPABILITY_LABELS: Record<AccessCapability, string> = {
  DASHBOARD_METRICS_READ: "Ver métricas del inicio",
  FAMILIES_READ: "Consultar el padrón familiar",
  FAMILIES_WRITE: "Modificar el padrón familiar",
  DELIVERY_READ: "Consultar registros de entrega",
  DELIVERY_WRITE: "Registrar beneficiarios y generar planillas",
  MERCHANDISE_READ: "Consultar solicitudes, cupos y remitos",
  MERCHANDISE_WRITE: "Registrar solicitudes y recepciones",
  RENDITIONS_READ: "Consultar rendiciones y documentos privados",
  RENDITIONS_WRITE: "Cargar documentos de rendición",
  RENDITIONS_REVIEW: "Revisar rendiciones",
};

export const ACCESS_CAPABILITY_FEATURES: Record<AccessCapability, string> = {
  DASHBOARD_METRICS_READ: "Inicio",
  FAMILIES_READ: "Familias",
  FAMILIES_WRITE: "Familias",
  DELIVERY_READ: "Registro",
  DELIVERY_WRITE: "Registro",
  MERCHANDISE_READ: "Mercadería",
  MERCHANDISE_WRITE: "Mercadería",
  RENDITIONS_READ: "Rendiciones",
  RENDITIONS_WRITE: "Rendiciones",
  RENDITIONS_REVIEW: "Rendiciones",
};

export const INITIAL_ACCESS_POLICY: Record<UserRole, AccessCapability[]> = {
  PRESIDENTE: Object.values(AccessCapability),
  SECRETARIA: Object.values(AccessCapability),
  TESORERIA: [],
  VOCALIA: [],
  REVISION_CUENTAS: [],
};
