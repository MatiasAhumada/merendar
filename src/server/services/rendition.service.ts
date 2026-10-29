import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";
import { findRenditionDocument, reviewRendition, type RenditionReviewStatus } from "@/server/repository/rendition.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";

export async function getRenditionDocument(id: string) {
  return findRenditionDocument(id);
}

export async function reviewRenditionDocument(input: {
  id: string;
  userId: string;
  status: RenditionReviewStatus;
  notes?: string;
}) {
  const result = await reviewRendition(input);

  if (result.type === "missing") {
    throw new ApiError({ status: 404, message: RENDITION_ERROR_MESSAGES.NO_ENCONTRAMOS_LA_RENDICION_SELECCIONADA });
  }

  if (result.type === "signed-sheet-required") {
    throw new ApiError({ status: 409, message: RENDITION_ERROR_MESSAGES.ADJUNTA_UNA_PLANILLA_FIRMADA_VIGENTE_ANTES_DE_REVISAR_LA_RENDICION });
  }

  return result.rendition;
}
