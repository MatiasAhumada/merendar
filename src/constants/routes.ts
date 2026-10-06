export const ROUTES = {
  HOME: "/",
  FAMILIES: "/familias",
  DELIVERY: "/entrega",
  GOODS: "/mercaderia",
  LOGIN: "/login",
} as const;

export const ROUTE_LABELS: Record<string, string> = {
  "": "Inicio",
  familias: "Familias",
  entrega: "Registrar entrega",
  mercaderia: "Mercadería",
  login: "Iniciar Sesión",
} as const;

export const API_ROUTES = {
  AUTH: {
    SESSION: "/api/session",
  },
  USERS: "/api/users",
} as const;
