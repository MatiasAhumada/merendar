import { FamilyRegistry } from "@/components/families/FamilyRegistry";
import { requireSession } from "@/server/services/auth-session";

export default async function FamiliesPage() {
  await requireSession();
  return <FamilyRegistry />;
}
