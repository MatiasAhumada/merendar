import { requireCapability } from "@/server/services/access-policy.service";

export const requireMerchandiseReadAccess = (token: string | undefined) =>
  requireCapability(token, "merchandise.read", "Iniciá sesión para consultar mercadería", "No tenés permiso para consultar mercadería");

export const requireMerchandiseWriteAccess = (token: string | undefined) =>
  requireCapability(token, "merchandise.write", "Iniciá sesión para gestionar mercadería", "No tenés permiso para gestionar mercadería");

export const requireRenditionReadAccess = (token: string | undefined) =>
  requireCapability(token, "renditions.read", "Iniciá sesión para consultar rendiciones", "No tenés permiso para consultar rendiciones");

export const requireRenditionWriteAccess = (token: string | undefined) =>
  requireCapability(token, "renditions.write", "Iniciá sesión para cargar documentos de rendición", "No tenés permiso para cargar documentos de rendición");

export const requireRenditionReviewAccess = (token: string | undefined) =>
  requireCapability(token, "renditions.review", "Iniciá sesión para revisar rendiciones", "No tenés permiso para revisar rendiciones");
