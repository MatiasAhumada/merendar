import { AppShell } from "@/components/shared/AppShell";
import { requireSession } from "@/server/services/auth-session";

export default async function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession();

  return <AppShell user={session.user}>{children}</AppShell>;
}
