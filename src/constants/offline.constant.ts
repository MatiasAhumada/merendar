export const OFFLINE_STORAGE = {
  DATABASE_PREFIX: "merendar-offline",
  DATABASE_VERSION: 1,
  OPERATIONS_STORE: "operations",
  MAX_OPERATION_BYTES: 1_000_000,
  LEASE_DURATION_MS: 30_000,
  STORAGE_RESERVE_BYTES: 2_000_000,
  SYNC_HISTORY_LIMIT: 1_000,
  SYNC_HISTORY_RETENTION_DAYS: 30,
} as const;

export const SYNC_ROUTES = {
  OPERATIONS: "/api/synchronizations",
} as const;

export const SYNC_MESSAGES = {
  SESSION_EXPIRED: "La sesión venció. Iniciá sesión con esta cuenta para conservar y sincronizar los cambios pendientes.",
  ACCOUNT_CHANGED: "Esta operación pertenece a otra cuenta y no se enviará con el usuario actual.",
  PERMISSION_REVOKED: "La cuenta ya no tiene permiso para enviar este cambio. Los datos siguen guardados en este dispositivo.",
  STORAGE_FULL: "No hay espacio suficiente para guardar el cambio sin conexión. Liberá espacio o conectate antes de volver a intentarlo.",
} as const;
