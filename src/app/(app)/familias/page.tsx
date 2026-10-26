"use client";

import { FamilyRegistry } from "@/components/families/FamilyRegistry";
import { SessionRoute } from "@/components/shared/SessionRoute";
import { useAppSession } from "@/components/shared/AppSessionContext";

export default function FamiliesPage() {
  const session = useAppSession();
  const canWrite = session.capabilities.includes("families.write");

  return (
    <SessionRoute capability="families.read">
      {session.user && session.sessionExpiresAt ? (
        <FamilyRegistry initialFamilies={[]} userId={session.user.id} sessionExpiresAt={session.sessionExpiresAt} canWrite={canWrite} />
      ) : null}
    </SessionRoute>
  );
}
