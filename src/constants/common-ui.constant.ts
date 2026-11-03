
export const COMMON_UI_TEXT = {
  CERRAR: "Cerrar",
  CARGANDO: "Cargando...",
  NO_HAY_DATOS_DISPONIBLES: "No hay datos disponibles",
  GUARDANDO: "Guardando…",
  PROCESANDO: "Procesando...",
  FILE_SIZE_IN_KIB: (byteSize: number) => `${Math.max(1, Math.round(byteSize / 1024))} KiB`,
} as const;
