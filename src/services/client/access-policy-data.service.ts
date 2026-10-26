import { API_ROUTES } from "@/constants/routes";
import clientAxios from "@/utils/clientAxios.util";
import { policySnapshotSchema } from "@/validations/access-policy-snapshot.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";

export async function getAccessPolicySnapshot(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, "/permisos", policySnapshotSchema);
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.ACCESS_POLICY);
    const parsedResponse = policySnapshotSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error("El servidor devolvió una matriz de permisos con formato inválido.");
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, "/permisos", parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, "/permisos", policySnapshotSchema);
  }
}
