"use client";

import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudIcon, CloudOffIcon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function ConnectionStatus() {
  const isOnline = useNetworkStatus();

  return (
    <Badge variant={isOnline ? "success" : "warning"} role="status" aria-live="polite" aria-label={isOnline ? APPLICATION_UI_TEXT.CON_CONEXION : APPLICATION_UI_TEXT.SIN_CONEXION} className="max-sm:gap-1 max-sm:px-1.5">
      <HugeiconsIcon icon={isOnline ? CloudIcon : CloudOffIcon} strokeWidth={1.8} data-icon="inline-start" />
      {isOnline ? (
        <>
          <span className="sm:hidden">{APPLICATION_UI_TEXT.EN_LINEA}</span>
          <span className="hidden sm:inline">{APPLICATION_UI_TEXT.CON_CONEXION}</span>
        </>
      ) : (
        <>
          <span className="sm:hidden">{APPLICATION_UI_TEXT.SIN_RED}</span>
          <span className="hidden sm:inline">{APPLICATION_UI_TEXT.SIN_CONEXION}</span>
        </>
      )}
    </Badge>
  );
}
