import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { merchandiseRepository } from "@/server/repository/merchandise.repository";
import { authService } from "@/server/services/auth.service";
import { requireMerchandiseReadAccess } from "@/server/services/merchandise-access";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import { ApiError } from "@/utils/handlers/apiError.handler";

export async function getVisibleMerchandisePeriods(token: string | undefined) {
  const session = await authService.getSession(token);

  if (!session) {
    throw new ApiError({ status: 401, message: MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_MERCADERIA });
  }

  const [canReadMerchandise, canReadRenditions] = await Promise.all([
    hasEffectiveCapability(session.user.role, "merchandise.read"),
    hasEffectiveCapability(session.user.role, "renditions.read"),
  ]);

  if (!canReadMerchandise && !canReadRenditions) {
    await requireMerchandiseReadAccess(token);
  }

  const periods = await merchandiseRepository.findAll();

  return periods.map((period) => {
    let requests = period.requests;
    let renditions = period.renditions;

    if (!canReadMerchandise) {
      requests = [];
    }

    if (!canReadRenditions) {
      renditions = [];
    }

    return { ...period, requests, renditions };
  });
}

export async function getMerchandiseDocument(id: string) {
  return merchandiseRepository.findDocument(id);
}
