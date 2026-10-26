"use client";

import { AccessPolicyAdministration } from "@/components/users/AccessPolicyAdministration";
import { SessionRoute } from "@/components/shared/SessionRoute";
import { useAppSession } from "@/components/shared/AppSessionContext";

export default function AccessPolicyPage() {
  const { user } = useAppSession();

  return (
    <SessionRoute capability="access-policy.manage">
      {user ? <AccessPolicyAdministration userId={user.id} /> : null}
    </SessionRoute>
  );
}
