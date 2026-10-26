import { AuthenticatedApplication } from "@/components/shared/AuthenticatedApplication";

export default function OperationsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AuthenticatedApplication>{children}</AuthenticatedApplication>;
}
