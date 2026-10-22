"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CloudIcon, CloudOffIcon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function ConnectionStatus() {
  const isOnline = useNetworkStatus();

  return (
    <Badge variant={isOnline ? "success" : "warning"} role="status" aria-live="polite" aria-label={isOnline ? "Con conexión" : "Sin conexión"} className="max-sm:gap-1 max-sm:px-1.5">
      <HugeiconsIcon icon={isOnline ? CloudIcon : CloudOffIcon} strokeWidth={1.8} data-icon="inline-start" />
      {isOnline ? (
        <>
          <span className="sm:hidden">En línea</span>
          <span className="hidden sm:inline">Con conexión</span>
        </>
      ) : (
        <>
          <span className="sm:hidden">Sin red</span>
          <span className="hidden sm:inline">Sin conexión</span>
        </>
      )}
    </Badge>
  );
}
