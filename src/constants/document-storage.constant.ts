export const DOCUMENT_STORAGE_ERROR_MESSAGES = {
  CONFIGURATION_REQUIRED: "Configurá R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET_NAME en el entorno privado del servidor.",
  UPLOAD_FAILED: "No se pudo guardar y verificar el documento en Cloudflare R2. No se confirmó la operación; revisá el acceso del servidor al bucket y reintentá.",
  READ_FAILED: "No se pudo leer el documento privado desde Cloudflare R2. Revisá el acceso del servidor al bucket y reintentá.",
  OBJECT_KEY_CONFLICT: "La clave de almacenamiento ya corresponde a un documento diferente.",
  INTEGRITY_FAILED: "R2 no confirmó la integridad del documento subido.",
} as const;
