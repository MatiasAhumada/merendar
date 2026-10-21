import { AppShell } from "@/components/shared/AppShell";
import { requireSession } from "@/server/services/auth-session";
import { getEffectiveCapabilities } from "@/server/services/access-policy.service";

export default async function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();
  const capabilities = await getEffectiveCapabilities(session.user.role);

  return <AppShell user={session.user} sessionExpiresAt={session.expiresAt.toISOString()} capabilities={capabilities}>{children}</AppShell>;
}
