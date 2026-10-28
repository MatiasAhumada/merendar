import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { requireCapability } from "@/server/services/access-policy.service";

export const requireMerchandiseReadAccess = (token: string | undefined) =>
  requireCapability(token, "merchandise.read", MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_MERCADERIA, MERCHANDISE_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_CONSULTAR_MERCADERIA);

export const requireMerchandiseWriteAccess = (token: string | undefined) =>
  requireCapability(token, "merchandise.write", MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_GESTIONAR_MERCADERIA, MERCHANDISE_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_GESTIONAR_MERCADERIA);

export const requireRenditionReadAccess = (token: string | undefined) =>
  requireCapability(token, "renditions.read", MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_RENDICIONES, MERCHANDISE_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_CONSULTAR_RENDICIONES);

export const requireRenditionWriteAccess = (token: string | undefined) =>
  requireCapability(token, "renditions.write", MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_CARGAR_DOCUMENTOS_DE_RENDICION, MERCHANDISE_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_CARGAR_DOCUMENTOS_DE_RENDICION);

export const requireRenditionReviewAccess = (token: string | undefined) =>
  requireCapability(token, "renditions.review", MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_REVISAR_RENDICIONES, MERCHANDISE_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_REVISAR_RENDICIONES);
