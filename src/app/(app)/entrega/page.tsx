import { DeliveryWorkbench } from "@/components/delivery/DeliveryWorkbench";
import { requireSession } from "@/server/services/auth-session";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function DeliveryPage() {
  const session = await requireSession();
  const canReadDelivery = await hasEffectiveCapability(session.user.role, "delivery.read");
  const canWriteDelivery = await hasEffectiveCapability(session.user.role, "delivery.write");
  const canReadFamilies = await hasEffectiveCapability(session.user.role, "families.read");
  const canReadMerchandise = await hasEffectiveCapability(session.user.role, "merchandise.read");
  const canWriteFamilies = await hasEffectiveCapability(session.user.role, "families.write");
  const canWriteMerchandise = await hasEffectiveCapability(session.user.role, "merchandise.write");

  if (!canReadDelivery) {
    return <Alert variant="destructive"><AlertTitle>Acceso no habilitado</AlertTitle><AlertDescription>El registro de entregas no está habilitado para tu rol.</AlertDescription></Alert>;
  }

  return <DeliveryWorkbench
    userId={session.user.id}
    sessionExpiresAt={session.expiresAt.toISOString()}
    canWrite={canWriteDelivery}
    canCreateFamilies={canReadFamilies && canWriteFamilies}
    canCreatePeriods={canReadMerchandise && canWriteMerchandise}
  />;
}
