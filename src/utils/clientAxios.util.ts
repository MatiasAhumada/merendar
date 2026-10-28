import { APPLICATION_CONFIG } from "@/config/application.config";
import { API_ROUTES } from "@/constants/routes.constant";
import axios from "axios";

function notifyConnectionStatus(isOnline: boolean) {
  if (!("window" in globalThis)) {
    return;
  }

  window.dispatchEvent(new CustomEvent(isOnline ? "merendar-network-reachable" : "merendar-network-unreachable"));
}

const clientAxios = axios.create({
  baseURL: APPLICATION_CONFIG.PUBLIC_API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

clientAxios.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

clientAxios.interceptors.response.use(
  (response) => {
    notifyConnectionStatus(true);
    const method = response.config.method?.toLowerCase();
    const requestUrl = response.config.url ?? "";

    if (method && method !== "get" && method !== "head" && !requestUrl.includes(API_ROUTES.AUTH.SESSION) && !requestUrl.includes(API_ROUTES.SYNCHRONIZATIONS)) {
      if ("window" in globalThis) {
        window.dispatchEvent(new Event("merendar-server-data-changed"));
      }
    }

    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && !error.response) {
      notifyConnectionStatus(false);
    } else {
      notifyConnectionStatus(true);
    }
    return Promise.reject(error);
  }
);

export default clientAxios;
