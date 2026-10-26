import clientAxios from "@/utils/clientAxios.util";
import { familyCollectionSchema } from "@/validations/family.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";

export async function getFamilyCollection(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, "/familias", familyCollectionSchema);
  }

  try {
    const response = await clientAxios.get<unknown>("/api/families", { headers: { "Cache-Control": "no-store" } });
    const parsedResponse = familyCollectionSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error("El servidor devolvió familias que el padrón no reconoce.");
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, "/familias", parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, "/familias", familyCollectionSchema);
  }
}
