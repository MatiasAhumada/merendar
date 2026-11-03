import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { merchandiseRepository } from "@/server/repository/merchandise.repository";
import { authService } from "@/server/services/auth.service";
import { requireMerchandiseReadAccess } from "@/server/services/merchandise-access";
import { getEffectiveCapabilities } from "@/server/services/access-policy.service";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { readDocumentObject } from "@/server/services/document-storage.service";
import { findDistributionEvents } from "@/server/repository/record.repository";

export async function getVisibleMerchandisePeriods(token: string | undefined) {
  const session = await authService.getSession(token);

  if (!session) {
    throw new ApiError({ status: 401, message: MERCHANDISE_ERROR_MESSAGES.INICIA_SESION_PARA_CONSULTAR_MERCADERIA });
  }

  const effectiveCapabilities = await getEffectiveCapabilities(session.user.role);
  const canReadMerchandise = effectiveCapabilities.includes("merchandise.read");
  const canReadRenditions = effectiveCapabilities.includes("renditions.read");
  const canReadDelivery = effectiveCapabilities.includes("delivery.read");

  if (!canReadMerchandise && !canReadRenditions) {
    await requireMerchandiseReadAccess(token);
  }

  const periods = await merchandiseRepository.findAll();
  let distributionEvents: Awaited<ReturnType<typeof findDistributionEvents>> = [];
  if (canReadDelivery) {
    distributionEvents = await findDistributionEvents();
  }

  return periods.map((period) => {
    let requests = period.requests;
    let renditions = period.renditions;

    if (!canReadMerchandise) {
      requests = [];
    }

    if (!canReadRenditions) {
      renditions = [];
    }

    const reportEvents = distributionEvents.filter((event) => event.periodId === period.id).map((event) => ({
      id: event.id,
      scheduledAt: event.scheduledAt.toISOString(),
      location: event.location,
      responsibleNames: event.responsibleNames,
      allocations: event.allocations.map((allocation) => ({ familyId: allocation.familyId, familyName: allocation.familyName, remittanceNumber: allocation.remittanceNumber, moduleQuantity: allocation.moduleQuantity })),
      familyDeliveries: event.familyDeliveries.map((delivery) => ({
        familyId: delivery.familyId,
        familyName: delivery.familyName,
        moduleQuantity: delivery.moduleQuantity,
        participants: delivery.participants.map((participant) => participant.name),
      })),
      supplyAllocations: event.supplyAllocations.map((allocation) => ({
        productName: allocation.productName,
        presentation: allocation.presentation,
        unit: allocation.unit,
        remittanceNumber: allocation.remittanceNumber,
        quantity: allocation.quantity,
      })),
    }));
    return { ...period, requests, renditions, reportDetails: { authorized: canReadDelivery, events: reportEvents } };
  });
}

export async function getMerchandiseDocument(id: string) {
  const document = await merchandiseRepository.findDocument(id);
  if (!document) {
    return null;
  }
  if (!document.storageKey) {
    throw new ApiError({ status: 503, message: "El documento todavía no está disponible en Cloudflare R2." });
  }
  const content = await readDocumentObject(document.storageKey, document.storageBucket);
  return { ...document, content };
}
