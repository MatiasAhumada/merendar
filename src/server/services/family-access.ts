import { FAMILY_ERROR_MESSAGES } from "@/constants/family.constant";
import { requireCapability } from "@/server/services/access-policy.service";

export const requireFamilyReadAccess = (token: string | undefined) =>
  requireCapability(token, "families.read", FAMILY_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_EL_PADRON_FAMILIAR, FAMILY_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_CONSULTAR_EL_PADRON_FAMILIAR);

export const requireFamilyWriteAccess = (token: string | undefined) =>
  requireCapability(token, "families.write", FAMILY_ERROR_MESSAGES.INICIA_SESION_PARA_MODIFICAR_EL_PADRON_FAMILIAR, FAMILY_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_MODIFICAR_EL_PADRON_FAMILIAR);
