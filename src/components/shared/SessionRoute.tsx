"use client";

import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppSession } from "@/components/shared/AppSessionContext";
import { OfflineAccessNotice } from "@/components/shared/OfflineAccessNotice";

export function SessionRoute({ capability, children }: { capability?: string; children: ReactNode }) {
  const session = useAppSession();

  if (!session.ready) {
    return <p role="status" className="text-sm text-muted-foreground">Comprobando el acceso…</p>;
  }

  if (!session.user) {
    return <OfflineAccessNotice />;
  }

  if (capability && !session.capabilities.includes(capability)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Acceso no habilitado</AlertTitle>
        <AlertDescription>Este módulo no está habilitado para tu rol.</AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}
