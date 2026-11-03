"use client";

import { DeliveryWorkbench } from "@/components/delivery/DeliveryWorkbench";
import { SessionRoute } from "@/components/shared/SessionRoute";
import { useAppSession } from "@/components/shared/AppSessionContext";

export default function DeliveryPage() {
  const session = useAppSession();
  const capabilities = session.capabilities;

  return (
    <SessionRoute capability="delivery.read">
      {session.user && session.sessionExpiresAt ? (
        <DeliveryWorkbench
          userId={session.user.id}
          sessionExpiresAt={session.sessionExpiresAt}
          canWrite={capabilities.includes("delivery.write")}
          canCreatePeriods={capabilities.includes("merchandise.read") && capabilities.includes("merchandise.write")}
          canReadMerchandise={capabilities.includes("merchandise.read")}
        />
      ) : null}
    </SessionRoute>
  );
}
