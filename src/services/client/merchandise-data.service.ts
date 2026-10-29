

import { NO_CACHE_REQUEST_HEADERS } from "@/constants/http.constant";
import { MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { merchandiseResponseSchema } from "@/schemas/merchandise.schema";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";
import clientAxios from "@/utils/clientAxios.util";

export async function getMerchandiseCollection(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, ROUTES.GOODS, merchandiseResponseSchema);
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.MERCHANDISE, { headers: NO_CACHE_REQUEST_HEADERS });
    const parsedResponse = merchandiseResponseSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error(MERCHANDISE_ERROR_MESSAGES.EL_SERVIDOR_DEVOLVIO_MODULOS_QUE_MERCADERIA_NO_RECONOCE);
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, ROUTES.GOODS, parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, ROUTES.GOODS, merchandiseResponseSchema);
  }
}
