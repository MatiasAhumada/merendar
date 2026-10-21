import { DeliveryWorkbench } from "@/components/delivery/DeliveryWorkbench";
import { requireSession } from "@/server/services/auth-session";

export default async function DeliveryPage() {
  const session = await requireSession();
  return <DeliveryWorkbench userId={session.user.id} sessionExpiresAt={session.expiresAt.toISOString()} />;
}
