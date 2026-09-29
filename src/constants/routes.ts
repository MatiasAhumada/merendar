export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
} as const;

export const ROUTE_LABELS: Record<string, string> = {
  "": "Inicio",
  login: "Iniciar Sesión",
} as const;

export const API_ROUTES = {
  AUTH: {
    SESSION: "/api/session",
  },
  USERS: "/api/users",
} as const;
