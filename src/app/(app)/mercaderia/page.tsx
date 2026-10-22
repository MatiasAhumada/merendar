import { MerchandiseWorkspace } from "@/components/merchandise/MerchandiseWorkspace";
import { requireSession } from "@/server/services/auth-session";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default async function MerchandisePage() {
  const session = await requireSession();
  const canReadMerchandise = await hasEffectiveCapability(session.user.role, "merchandise.read");
  const canReadRenditions = await hasEffectiveCapability(session.user.role, "renditions.read");
  const canWriteMerchandise = await hasEffectiveCapability(session.user.role, "merchandise.write");
  const canWriteRenditions = await hasEffectiveCapability(session.user.role, "renditions.write");
  const canReviewRenditions = await hasEffectiveCapability(session.user.role, "renditions.review");

  if (!canReadMerchandise && !canReadRenditions) {
    return <Alert variant="destructive"><AlertTitle>Acceso no habilitado</AlertTitle><AlertDescription>Mercadería y rendiciones no están habilitadas para tu rol.</AlertDescription></Alert>;
  }

  return <MerchandiseWorkspace
    userId={session.user.id}
    sessionExpiresAt={session.expiresAt.toISOString()}
    canReadMerchandise={canReadMerchandise}
    canWriteMerchandise={canWriteMerchandise}
    canReadRenditions={canReadRenditions}
    canWriteRenditions={canWriteRenditions}
    canReviewRenditions={canReviewRenditions}
  />;
}
