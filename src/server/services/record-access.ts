import { requireCapability } from "@/server/services/access-policy.service";

export const requireRecordReadAccess = (token: string | undefined) =>
  requireCapability(token, "delivery.read", "Iniciá sesión para consultar los registros", "No tenés permiso para consultar los registros");

export const requireRecordWriteAccess = (token: string | undefined) =>
  requireCapability(token, "delivery.write", "Iniciá sesión para registrar módulos", "No tenés permiso para registrar módulos");
