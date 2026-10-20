"use client";

import { useEffect } from "react";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let reloadAfterControlChange = false;

    function reloadForUpdatedWorker() {
      if (!reloadAfterControlChange) {
        reloadAfterControlChange = true;
        window.location.reload();
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdatedWorker);

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        clientErrorHandler(error, () => {}, { logToConsole: false, showToast: false });
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadForUpdatedWorker);
    };
  }, []);

  return null;
}
