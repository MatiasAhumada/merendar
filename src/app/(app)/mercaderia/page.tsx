import { MerchandiseWorkspace } from "@/components/merchandise/MerchandiseWorkspace";
import { requireSession } from "@/server/services/auth-session";

export default async function MerchandisePage() {
  await requireSession();
  return <MerchandiseWorkspace />;
}
