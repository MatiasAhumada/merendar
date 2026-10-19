import { DeliveryWorkbench } from "@/components/delivery/DeliveryWorkbench";
import { requireSession } from "@/server/services/auth-session";

export default async function DeliveryPage() {
  await requireSession();
  return <DeliveryWorkbench />;
}
