

import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { policySnapshotSchema } from "@/schemas/access-policy.schema";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";
import clientAxios from "@/utils/clientAxios.util";

export async function getAccessPolicySnapshot(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, ROUTES.ACCESS_POLICY, policySnapshotSchema);
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.ACCESS_POLICY);
    const parsedResponse = policySnapshotSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error(USER_ERROR_MESSAGES.EL_SERVIDOR_DEVOLVIO_UNA_MATRIZ_DE_PERMISOS_CON_FORMATO_INVALIDO);
    }

    const cacheUpdated = await updateOfflineSnapshot(userId, ROUTES.ACCESS_POLICY, parsedResponse.data);
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, ROUTES.ACCESS_POLICY, policySnapshotSchema);
  }
}
