import { redirect } from "next/navigation";
import { ROUTES } from "@/constants/routes";
import { requireSession } from "@/server/services/auth-session";
import { UserAdministration } from "@/components/users/UserAdministration";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";

export default async function UsersPage() {
  const session = await requireSession();
  const canManageUsers = await hasEffectiveCapability(session.user.role, "users.manage");
  if (!canManageUsers) redirect(ROUTES.HOME);
  return <UserAdministration />;
}
