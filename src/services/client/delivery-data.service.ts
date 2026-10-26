import clientAxios from "@/utils/clientAxios.util";
import { recordsCollectionSchema } from "@/validations/record.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";

export async function getDeliveryCollection(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, "/entrega", recordsCollectionSchema);
  }

  try {
    const response = await clientAxios.get<unknown>("/api/records?includePeriodDetails=true", { headers: { "Cache-Control": "no-store" } });
    const parsedResponse = recordsCollectionSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error("El servidor devolvió registros que Registro no reconoce.");
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, "/entrega", parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, "/entrega", recordsCollectionSchema);
  }
}
