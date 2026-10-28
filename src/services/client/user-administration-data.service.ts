

import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { managedUsersSchema } from "@/validations/user-administration.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";
import clientAxios from "@/utils/clientAxios.util";

export async function getManagedUsers(userId: string, isOnline: boolean, search = "") {
  if (!isOnline) {
    const result = await readOfflineSnapshot(userId, ROUTES.USERS, managedUsersSchema);
    return search.trim()
      ? { ...result, data: { users: result.data.users.filter((user) => `${user.name} ${user.email ?? ""}`.toLocaleLowerCase("es-AR").includes(search.trim().toLocaleLowerCase("es-AR"))) } }
      : result;
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.USERS, { params: { search } });
    const parsedResponse = managedUsersSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error(USER_ERROR_MESSAGES.EL_SERVIDOR_DEVOLVIO_CUENTAS_QUE_USUARIOS_NO_RECONOCE);
    }

    const persistCompleteCollection = search.trim().length === 0;
    const cacheUpdated = persistCompleteCollection
      ? await updateOfflineSnapshot(userId, ROUTES.USERS, parsedResponse.data)
      : false;
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    const result = await readOfflineSnapshot(userId, ROUTES.USERS, managedUsersSchema);
    return search.trim()
      ? { ...result, data: { users: result.data.users.filter((user) => `${user.name} ${user.email ?? ""}`.toLocaleLowerCase("es-AR").includes(search.trim().toLocaleLowerCase("es-AR"))) } }
      : result;
  }
}
