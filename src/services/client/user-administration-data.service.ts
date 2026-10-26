import { API_ROUTES } from "@/constants/routes";
import clientAxios from "@/utils/clientAxios.util";
import { managedUsersSchema } from "@/validations/user-administration.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";

export async function getManagedUsers(userId: string, isOnline: boolean, search = "") {
  if (!isOnline) {
    const result = await readOfflineSnapshot(userId, "/usuarios", managedUsersSchema);
    return search.trim()
      ? { ...result, data: { users: result.data.users.filter((user) => `${user.name} ${user.email ?? ""}`.toLocaleLowerCase("es-AR").includes(search.trim().toLocaleLowerCase("es-AR"))) } }
      : result;
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.USERS, { params: { search } });
    const parsedResponse = managedUsersSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error("El servidor devolvió cuentas que Usuarios no reconoce.");
    }

    const persistCompleteCollection = search.trim().length === 0;
    const cacheUpdated = persistCompleteCollection
      ? await updateOfflineSnapshot(userId, "/usuarios", parsedResponse.data)
      : false;
    return apiDataResult(parsedResponse.data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    const result = await readOfflineSnapshot(userId, "/usuarios", managedUsersSchema);
    return search.trim()
      ? { ...result, data: { users: result.data.users.filter((user) => `${user.name} ${user.email ?? ""}`.toLocaleLowerCase("es-AR").includes(search.trim().toLocaleLowerCase("es-AR"))) } }
      : result;
  }
}
