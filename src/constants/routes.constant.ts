export const ROUTES = {
  HOME: "/",
  FAMILIES: "/familias",
  DELIVERY: "/entrega",
  GOODS: "/mercaderia",
  LOGIN: "/login",
  USERS: "/usuarios",
  ACCESS_POLICY: "/permisos",
  PWA_MANIFEST: "/manifest.webmanifest",
  SERVICE_WORKER: "/sw.js",
  SERVICE_WORKER_CONFIG: "/sw-config.js",
} as const;

export const OFFLINE_PREPARED_ROUTES = [
  ROUTES.HOME,
  ROUTES.FAMILIES,
  ROUTES.GOODS,
  ROUTES.DELIVERY,
  ROUTES.USERS,
  ROUTES.ACCESS_POLICY,
] as const;

export const API_ROUTES = {
  AUTH: {
    SESSION: "/api/session",
  },
  DASHBOARD: "/api/dashboard",
  FAMILIES: "/api/families",
  MERCHANDISE: "/api/merchandise",
  MERCHANDISE_REQUEST_DOCUMENT_PROFILE: "/api/merchandise/request-document-profile",
  MERCHANDISE_DOCUMENT: (documentId: string) => `/api/merchandise/documents/${encodeURIComponent(documentId)}`,
  MERCHANDISE_REQUEST_DOCUMENTS: (requestId: string) => `/api/merchandise/requests/${encodeURIComponent(requestId)}/documents`,
  RECORDS: "/api/records",
  DELIVERY_RECORDS: "/api/records?includePeriodDetails=true",
  RECORD_SHEETS: "/api/records/sheets",
  RECORD_SHEET: (sheetId: string) => `/api/records/sheets/${encodeURIComponent(sheetId)}`,
  RENDITION_DOCUMENT: (documentId: string) => `/api/renditions/documents/${encodeURIComponent(documentId)}`,
  RENDITION_DOCUMENT_PREVIEW: (documentId: string) => `/api/renditions/documents/${encodeURIComponent(documentId)}?inline=1`,
  RENDITION_EMISSION: (renditionId: string) => `/api/renditions/${encodeURIComponent(renditionId)}/emissions`,
  RENDITION_EMISSION_DOCUMENT: (emissionId: string, kind: "note" | "summary" | "package") => `/api/renditions/emissions/${encodeURIComponent(emissionId)}?kind=${kind}`,
  RENDITION_SUBMISSION: (renditionId: string) => `/api/renditions/${encodeURIComponent(renditionId)}/submissions`,
  SYNCHRONIZATIONS: "/api/synchronizations",
  USERS: "/api/users",
  ACCESS_POLICY: "/api/access-policy",
} as const;
