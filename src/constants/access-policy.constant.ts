import type { AccessCapability, UserRole } from "@prisma/client";

export const ACCESS_CAPABILITY_OPTIONS = [
  "DASHBOARD_METRICS_READ",
  "FAMILIES_READ",
  "FAMILIES_WRITE",
  "DELIVERY_READ",
  "DELIVERY_WRITE",
  "MERCHANDISE_READ",
  "MERCHANDISE_WRITE",
  "RENDITIONS_READ",
  "RENDITIONS_WRITE",
  "RENDITIONS_REVIEW",
] as const satisfies readonly AccessCapability[];

const ACCESS_CAPABILITY_FEATURE_LABELS = {
  DASHBOARD: "Inicio",
  FAMILIES: "Familias",
  DELIVERY: "Registro",
  MERCHANDISE: "Mercadería",
  RENDITIONS: "Rendiciones",
} as const;

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

export const RESERVED_ACCESS_CAPABILITIES = {
  USERS_MANAGE: "users.manage",
  ACCESS_POLICY_MANAGE: "access-policy.manage",
} as const;

export const RESERVED_ACCESS_CAPABILITY_KEYS = [
  RESERVED_ACCESS_CAPABILITIES.USERS_MANAGE,
  RESERVED_ACCESS_CAPABILITIES.ACCESS_POLICY_MANAGE,
] as const;

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
  DASHBOARD_METRICS_READ: ACCESS_CAPABILITY_FEATURE_LABELS.DASHBOARD,
  FAMILIES_READ: ACCESS_CAPABILITY_FEATURE_LABELS.FAMILIES,
  FAMILIES_WRITE: ACCESS_CAPABILITY_FEATURE_LABELS.FAMILIES,
  DELIVERY_READ: ACCESS_CAPABILITY_FEATURE_LABELS.DELIVERY,
  DELIVERY_WRITE: ACCESS_CAPABILITY_FEATURE_LABELS.DELIVERY,
  MERCHANDISE_READ: ACCESS_CAPABILITY_FEATURE_LABELS.MERCHANDISE,
  MERCHANDISE_WRITE: ACCESS_CAPABILITY_FEATURE_LABELS.MERCHANDISE,
  RENDITIONS_READ: ACCESS_CAPABILITY_FEATURE_LABELS.RENDITIONS,
  RENDITIONS_WRITE: ACCESS_CAPABILITY_FEATURE_LABELS.RENDITIONS,
  RENDITIONS_REVIEW: ACCESS_CAPABILITY_FEATURE_LABELS.RENDITIONS,
};

export const INITIAL_ACCESS_POLICY: Record<UserRole, AccessCapability[]> = {
  PRESIDENTE: [...ACCESS_CAPABILITY_OPTIONS],
  SECRETARIA: [...ACCESS_CAPABILITY_OPTIONS],
  TESORERIA: [],
  VOCALIA: [],
  REVISION_CUENTAS: [],
};
