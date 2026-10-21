import { MerchandiseWorkspace } from "@/components/merchandise/MerchandiseWorkspace";
import { requireSession } from "@/server/services/auth-session";

export default async function MerchandisePage() {
  const session = await requireSession();
  return <MerchandiseWorkspace userId={session.user.id} sessionExpiresAt={session.expiresAt.toISOString()} />;
}
