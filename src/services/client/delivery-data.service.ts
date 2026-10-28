

import { NO_STORE_REQUEST_HEADERS } from "@/constants/http.constant";
import { APPLICATION_ERROR_MESSAGES } from "@/constants/error-messages.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { recordsCollectionSchema } from "@/validations/record.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";
import clientAxios from "@/utils/clientAxios.util";

export async function getDeliveryCollection(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, ROUTES.DELIVERY, recordsCollectionSchema);
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.DELIVERY_RECORDS, { headers: NO_STORE_REQUEST_HEADERS });
    const parsedResponse = recordsCollectionSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error(APPLICATION_ERROR_MESSAGES.EL_SERVIDOR_DEVOLVIO_REGISTROS_QUE_REGISTRO_NO_RECONOCE);
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, ROUTES.DELIVERY, parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, ROUTES.DELIVERY, recordsCollectionSchema);
  }
}
