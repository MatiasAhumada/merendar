import { ROUTES } from "@/constants/routes.constant";
import {
  Archive01Icon,
  DocumentValidationIcon,
  PackageIcon,
  UserAdd01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";

export const DASHBOARD_METRICS = [
  { label: "Familias", description: "En el padrón", icon: UserGroupIcon },
  { label: "Personas", description: "Integrantes registrados", icon: UserMultipleIcon },
  { label: "Cupos aprobados", description: "Período vigente", icon: Archive01Icon },
] as const;

export const DASHBOARD_ACTIONS = [
  {
    label: "Padrón familiar",
    description: "Consultar familias",
    href: ROUTES.FAMILIES,
    icon: UserGroupIcon,
    capability: "families.read",
  },
  {
    label: "Registro de beneficiarios",
    description: "Planillas para firma manual",
    href: ROUTES.DELIVERY,
    icon: DocumentValidationIcon,
    capability: "delivery.read",
  },
  {
    label: "Solicitudes y cupos",
    description: "Consultar módulos",
    href: ROUTES.GOODS,
    icon: PackageIcon,
    capability: "merchandise.read",
  },
  {
    label: "Recepciones y remitos",
    description: "Consultar mercadería",
    href: ROUTES.GOODS,
    icon: Archive01Icon,
    capability: "merchandise.read",
  },
  {
    label: "Rendición documental",
    description: "Consultar planillas y documentos",
    href: ROUTES.GOODS,
    icon: Archive01Icon,
    capability: "renditions.read",
  },
  {
    label: "Administrar usuarios",
    description: "Cuentas y permisos",
    href: ROUTES.USERS,
    icon: UserAdd01Icon,
    capability: "users.manage",
  },
  {
    label: "Administrar permisos",
    description: "Configurar capacidades por rol",
    href: ROUTES.ACCESS_POLICY,
    icon: UserAdd01Icon,
    capability: "access-policy.manage",
  },
] as const;

export const DASHBOARD_UI_TEXT = {
  HOLA: "Hola, ",
  RESUMEN_DE_LOS_MODULOS_PERSISTENTES_DE_MERENDAR: "Resumen de los módulos persistentes de Merendar",
  ACCESOS_DISPONIBLES: "Accesos disponibles",
  SEGUN_TU_ROL: "Según tu rol",
  TU_CUENTA_TODAVIA_NO_TIENE_MODULOS_OPERATIVOS: "Tu cuenta todavía no tiene módulos operativos",
  SI_NECESITAS_CONSULTAR_O_REGISTRAR_UNA_TAREA_DE_LA_ORGANIZACION_PEDILE_A: "Si necesitás consultar o registrar una tarea de la organización, pedile a Presidencia que revise las capacidades habilitadas para tu rol.",
  PREPARANDO_EL_INICIO_PARA_ESTA_CUENTA: "Preparando el inicio para esta cuenta…",
  NO_PUDIMOS_CARGAR_LOS_DATOS_DEL_INICIO: "No pudimos cargar los datos del inicio",
  RESUMEN_GUARDADO_PARA_CONSULTA: "Resumen guardado para consulta",
  LAS_CIFRAS_SON_UNA_LECTURA_CONFIRMADA_AL_MOMENTO_DE_LA_CAPTURA_Y_NO_INCL: "Las cifras son una lectura confirmada al momento de la captura y no incluyen cambios pendientes.",
  RESUMEN_NO_PREPARADO: "Resumen no preparado",
  CONECTATE_PARA_CARGAR_LAS_METRICAS_AUTORIZADAS_DE_ESTA_CUENTA: "Conectate para cargar las métricas autorizadas de esta cuenta.",
  VER_ACCIONES_DISPONIBLES: "Ver acciones disponibles",
  RESUMEN_DEL_PADRON_Y_CUPOS: "Resumen del padrón y cupos",
  DATOS_ACTUALIZADOS: "Datos actualizados: ",
  CAPTURA_DEL: "Captura del ",
  LOS_CAMBIOS_PENDIENTES_SE_MUESTRAN_POR_SEPARADO: ". Los cambios pendientes se muestran por separado.",
  NO_DISPONIBLE: "No disponible",
  TODAVIA_NO_HAY_FAMILIAS: "Todavía no hay familias",
  TODAVIA_NO_HAY_PERSONAS: "Todavía no hay personas",
  CUPOS_APROBADOS: "Cupos aprobados",
  NO_HAY_UN_PERIODO_VIGENTE: "No hay un período vigente",
  SIN_CUPOS_APROBADOS_EN_EL_PERIODO: "Sin cupos aprobados en el período",
  LAS_METRICAS_APARECERAN_AL_RECUPERAR_CONEXION: "Las métricas aparecerán al recuperar conexión.",
  ESTE_RESUMEN_NO_MUESTRA_DATOS_DE_OTROS_ROLES: "Este resumen no muestra datos de otros roles.",
  PERIODO_OPERATIVO_VIGENTE: "Período operativo vigente",
  CONSULTA_LOS_MODULOS_HABILITADOS_PARA_TU_ROL: "Consultá los módulos habilitados para tu rol.",
  DATOS_NO_DISPONIBLES: "Datos no disponibles",
  CONSULTA_LOCAL_PREPARADA_PARA_ESTA_CUENTA: "Consulta local preparada para esta cuenta.",
  PANEL_INFORMATIVO: "Panel informativo",
  GESTION_COMUNITARIA: "Gestión comunitaria",
  CONSULTA_LOCAL_CAPTURADA: (capturedAt: string) => `Consulta local capturada el ${capturedAt}. Puede estar desactualizada.`,
} as const;

export const DASHBOARD_ERROR_MESSAGES = {
  NO_TENES_PERMISO_PARA_CONSULTAR_LAS_METRICAS_DEL_INICIO: "No tenés permiso para consultar las métricas del inicio",
  NO_SE_PUDO_CARGAR_EL_RESUMEN_DEL_INICIO: "No se pudo cargar el resumen del inicio",
  EL_SERVIDOR_DEVOLVIO_METRICAS_QUE_INICIO_NO_RECONOCE: "El servidor devolvió métricas que Inicio no reconoce.",
  INICIA_SESION_PARA_CONSULTAR_EL_RESUMEN: "Iniciá sesión para consultar el resumen",
  NO_SE_PUDIERON_CARGAR_LAS_METRICAS_DEL_INICIO: "No se pudieron cargar las métricas del inicio.",
} as const;
