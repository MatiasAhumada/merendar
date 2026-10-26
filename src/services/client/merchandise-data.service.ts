import clientAxios from "@/utils/clientAxios.util";
import { merchandiseResponseSchema } from "@/validations/merchandise-response.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";

export async function getMerchandiseCollection(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, "/mercaderia", merchandiseResponseSchema);
  }

  try {
    const response = await clientAxios.get<unknown>("/api/merchandise", { headers: { "Cache-Control": "no-cache" } });
    const parsedResponse = merchandiseResponseSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error("El servidor devolvió módulos que Mercadería no reconoce.");
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, "/mercaderia", parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, "/mercaderia", merchandiseResponseSchema);
  }
}
