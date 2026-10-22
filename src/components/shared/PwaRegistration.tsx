"use client";

import { useEffect } from "react";
import { clientErrorHandler } from "@/utils/handlers/clientHandler";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        clientErrorHandler(error, () => {}, { logToConsole: false, showToast: false });
      });

    return undefined;
  }, []);

  return null;
}
