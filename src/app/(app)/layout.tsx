import { AppShell } from "@/components/shared/AppShell";

export default function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
