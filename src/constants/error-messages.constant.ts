export const ERROR_MESSAGES = {
  UNAUTHORIZED: "No autorizado",
  FORBIDDEN: "Acceso denegado",
  NOT_FOUND: "Recurso no encontrado",
  VALIDATION_ERROR: "Error de validación",
  INTERNAL_SERVER_ERROR: "Error interno del servidor",
  UNKNOWN_ERROR: "Error desconocido",
  FORM_VALIDATION: "Error en la validación del formulario",
} as const;

export const APPLICATION_ERROR_MESSAGES = {
  ESTE_NAVEGADOR_NO_ADMITE_PREPARACION_AUTOMATICA_PARA_USO_SIN_CONEXION: "Este navegador no admite preparación automática para uso sin conexión.",
  LA_SESION_DEVOLVIO_UN_PERFIL_QUE_ESTA_VERSION_DE_MERENDAR_NO_RECONOCE: "La sesión devolvió un perfil que esta versión de Merendar no reconoce.",
  DATABASE_URL_ES_OBLIGATORIA_PARA_INICIAR_LA_APLICACION: "DATABASE_URL es obligatoria para iniciar la aplicación.",
  EL_SERVIDOR_DEVOLVIO_REGISTROS_QUE_REGISTRO_NO_RECONOCE: "El servidor devolvió registros que Registro no reconoce.",
  ERROR_DE_CONEXION: "Error de conexión",
  EL_PADRON_YA_CONTIENE_UNA_PERSONA_CON_UN_DNI_DE_ESTA_FICHA: "El padrón ya contiene una persona con un DNI de esta ficha.",
  LOS_CAMBIOS_SE_ENVIAN_CON_LA_SESION_Y_LOS_PERMISOS_ACTUALES_DE_ESTA_CUENTA: "Los cambios se envían con la sesión y los permisos actuales de esta cuenta.",
  INICIA_SESION_PARA_CONSULTAR_LOS_REGISTROS: "Iniciá sesión para consultar los registros",
  NO_TENES_PERMISO_PARA_CONSULTAR_LOS_REGISTROS: "No tenés permiso para consultar los registros",
  INICIA_SESION_PARA_REGISTRAR_MODULOS: "Iniciá sesión para registrar módulos",
  NO_TENES_PERMISO_PARA_REGISTRAR_MODULOS: "No tenés permiso para registrar módulos",
} as const;
