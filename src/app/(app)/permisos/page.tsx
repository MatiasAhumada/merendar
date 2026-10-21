import { redirect } from "next/navigation";
import { AccessPolicyAdministration } from "@/components/users/AccessPolicyAdministration";
import { ROUTES } from "@/constants/routes";
import { requireSession } from "@/server/services/auth-session";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";

export default async function AccessPolicyPage() {
  const session = await requireSession();
  const canManageAccessPolicy = await hasEffectiveCapability(session.user.role, "access-policy.manage");

  if (!canManageAccessPolicy) {
    redirect(ROUTES.HOME);
  }

  return <AccessPolicyAdministration />;
}
