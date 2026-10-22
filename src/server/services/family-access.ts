import { requireCapability } from "@/server/services/access-policy.service";

export const requireFamilyReadAccess = (token: string | undefined) =>
  requireCapability(token, "families.read", "Iniciá sesión para consultar el padrón familiar", "No tenés permiso para consultar el padrón familiar");

export const requireFamilyWriteAccess = (token: string | undefined) =>
  requireCapability(token, "families.write", "Iniciá sesión para modificar el padrón familiar", "No tenés permiso para modificar el padrón familiar");
