"use client";

import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppSession } from "@/components/shared/AppSessionContext";
import { OfflineAccessNotice } from "@/components/shared/OfflineAccessNotice";
import type { ReactNode } from "react";

export function SessionRoute({ capability, children }: { capability?: string; children: ReactNode }) {
  const session = useAppSession();

  if (!session.ready) {
    return <p role="status" className="text-sm text-muted-foreground">{APPLICATION_UI_TEXT.COMPROBANDO_EL_ACCESO}</p>;
  }

  if (!session.user) {
    return <OfflineAccessNotice />;
  }

  if (capability && !session.capabilities.includes(capability)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{APPLICATION_UI_TEXT.ACCESO_NO_HABILITADO}</AlertTitle>
        <AlertDescription>{APPLICATION_UI_TEXT.ESTE_MODULO_NO_ESTA_HABILITADO_PARA_TU_ROL}</AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}
