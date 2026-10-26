"use client";

import { MerchandiseWorkspace } from "@/components/merchandise/MerchandiseWorkspace";
import { SessionRoute } from "@/components/shared/SessionRoute";
import { useAppSession } from "@/components/shared/AppSessionContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function MerchandisePage() {
  const session = useAppSession();
  const capabilities = session.capabilities;
  const canReadMerchandise = capabilities.includes("merchandise.read");
  const canReadRenditions = capabilities.includes("renditions.read");

  if (!session.ready || !session.user) {
    return <SessionRoute>{null}</SessionRoute>;
  }

  if (!canReadMerchandise && !canReadRenditions) {
    return (
      <SessionRoute>
        <Alert variant="destructive"><AlertTitle>Acceso no habilitado</AlertTitle><AlertDescription>Mercadería y rendiciones no están habilitadas para tu rol.</AlertDescription></Alert>
      </SessionRoute>
    );
  }

  return (
    <MerchandiseWorkspace
      userId={session.user.id}
      sessionExpiresAt={session.sessionExpiresAt ?? ""}
      canReadMerchandise={canReadMerchandise}
      canWriteMerchandise={capabilities.includes("merchandise.write")}
      canReadRenditions={canReadRenditions}
      canWriteRenditions={capabilities.includes("renditions.write")}
      canReviewRenditions={capabilities.includes("renditions.review")}
    />
  );
}
