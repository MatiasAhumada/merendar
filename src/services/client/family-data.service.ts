

import { NO_STORE_REQUEST_HEADERS } from "@/constants/http.constant";
import { FAMILY_ERROR_MESSAGES } from "@/constants/family.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { familyCollectionSchema } from "@/validations/family.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";
import clientAxios from "@/utils/clientAxios.util";

export async function getFamilyCollection(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, ROUTES.FAMILIES, familyCollectionSchema);
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.FAMILIES, { headers: NO_STORE_REQUEST_HEADERS });
    const parsedResponse = familyCollectionSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error(FAMILY_ERROR_MESSAGES.EL_SERVIDOR_DEVOLVIO_FAMILIAS_QUE_EL_PADRON_NO_RECONOCE);
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, ROUTES.FAMILIES, parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, ROUTES.FAMILIES, familyCollectionSchema);
  }
}
