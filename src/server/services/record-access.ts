import { APPLICATION_ERROR_MESSAGES } from "@/constants/error-messages.constant";
import { requireCapability } from "@/server/services/access-policy.service";

export const requireRecordReadAccess = (token: string | undefined) =>
  requireCapability(token, "delivery.read", APPLICATION_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_LOS_REGISTROS, APPLICATION_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_CONSULTAR_LOS_REGISTROS);

export const requireRecordWriteAccess = (token: string | undefined) =>
  requireCapability(token, "delivery.write", APPLICATION_ERROR_MESSAGES.INICIA_SESION_PARA_REGISTRAR_MODULOS, APPLICATION_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_REGISTRAR_MODULOS);
