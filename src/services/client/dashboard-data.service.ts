import clientAxios from "@/utils/clientAxios.util";
import type { DashboardSummaryResult } from "@/types/dashboard";
import { dashboardSummaryResponseSchema } from "@/validations/dashboard.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";

export async function getDashboardSummary(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, "/", dashboardSummaryResponseSchema);
  }

  try {
    const response = await clientAxios.get<unknown>("/api/dashboard", { headers: { "Cache-Control": "no-store" } });
    const parsedResponse = dashboardSummaryResponseSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error("El servidor devolvió métricas que Inicio no reconoce.");
    }

    const data: DashboardSummaryResult = parsedResponse.data;
    const cacheUpdated = await updateOfflineSnapshot(userId, "/", data);
    return apiDataResult(data, cacheUpdated);
  } catch (error) {
    if (!isTransportFailure(error)) {
      throw error;
    }

    return readOfflineSnapshot(userId, "/", dashboardSummaryResponseSchema);
  }
}
