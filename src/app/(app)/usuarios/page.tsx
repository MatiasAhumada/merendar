"use client";

import { UserAdministration } from "@/components/users/UserAdministration";
import { SessionRoute } from "@/components/shared/SessionRoute";
import { useAppSession } from "@/components/shared/AppSessionContext";

export default function UsersPage() {
  const { user } = useAppSession();

  return (
    <SessionRoute capability="users.manage">
      {user ? <UserAdministration userId={user.id} /> : null}
    </SessionRoute>
  );
}
