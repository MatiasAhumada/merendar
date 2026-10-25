"use client";

import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    function updateNetworkStatus() {
      setIsOnline(navigator.onLine);
    }

    function markNetworkReachable() {
      setIsOnline(true);
    }

    function markNetworkUnreachable() {
      setIsOnline(false);
    }

    updateNetworkStatus();
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    window.addEventListener("merendar-network-reachable", markNetworkReachable);
    window.addEventListener("merendar-network-unreachable", markNetworkUnreachable);

    return () => {
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
      window.removeEventListener("merendar-network-reachable", markNetworkReachable);
      window.removeEventListener("merendar-network-unreachable", markNetworkUnreachable);
    };
  }, []);

  return isOnline;
}
