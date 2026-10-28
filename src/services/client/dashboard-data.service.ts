

import { NO_STORE_REQUEST_HEADERS } from "@/constants/http.constant";
import { DASHBOARD_ERROR_MESSAGES } from "@/constants/dashboard.constant";
import { API_ROUTES } from "@/constants/routes.constant";
import { dashboardSummaryResponseSchema } from "@/validations/dashboard.validation";
import { apiDataResult, isTransportFailure, readOfflineSnapshot, updateOfflineSnapshot } from "@/services/client/offline-snapshot.service";
import clientAxios from "@/utils/clientAxios.util";

import type { DashboardSummaryResult } from "@/types/dashboard";

export async function getDashboardSummary(userId: string, isOnline: boolean) {
  if (!isOnline) {
    return readOfflineSnapshot(userId, "/", dashboardSummaryResponseSchema);
  }

  try {
    const response = await clientAxios.get<unknown>(API_ROUTES.DASHBOARD, { headers: NO_STORE_REQUEST_HEADERS });
    const parsedResponse = dashboardSummaryResponseSchema.safeParse(response.data);
    if (!parsedResponse.success) {
      throw new Error(DASHBOARD_ERROR_MESSAGES.EL_SERVIDOR_DEVOLVIO_METRICAS_QUE_INICIO_NO_RECONOCE);
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
