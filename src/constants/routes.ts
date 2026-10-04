export const ROUTES = {
  HOME: "/",
  FAMILIES: "/familias",
  DELIVERY: "/entrega",
  GOODS: "/mercaderia",
  HISTORY: "/historial",
  LOGIN: "/login",
} as const;

export const ROUTE_LABELS: Record<string, string> = {
  "": "Inicio",
  familias: "Familias",
  entrega: "Entrega Activa",
  mercaderia: "Mercadería",
  historial: "Historial",
  login: "Iniciar Sesión",
} as const;

export const API_ROUTES = {
  AUTH: {
    SESSION: "/api/session",
  },
  USERS: "/api/users",
} as const;
