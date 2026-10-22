export const AUTH = {
  SESSION_COOKIE: "merendar_session",
  SESSION_DURATION_HOURS: 12,
  LOGIN_ATTEMPT_WINDOW_MINUTES: 15,
  MAX_LOGIN_ATTEMPTS: 5,
  IDENTIFIER_MAX_LENGTH: 254,
  USERNAME_MAX_LENGTH: 64,
  PASSWORD_MAX_LENGTH: 128,
} as const;

export const AUTH_MESSAGES = {
  INVALID_CREDENTIALS: "El usuario, correo o contraseña son incorrectos.",
  LOGIN_UNAVAILABLE: "No se pudo iniciar sesión. Intentá de nuevo más tarde.",
  SESSION_EXPIRED: "Tu sesión venció. Ingresá nuevamente.",
  REQUEST_FAILED: "No se pudo completar la solicitud.",
} as const;
