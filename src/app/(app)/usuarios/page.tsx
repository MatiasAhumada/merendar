import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { ROUTES } from "@/constants/routes";
import { requireSession } from "@/server/services/auth-session";
import { UserAdministration } from "@/components/users/UserAdministration";

export default async function UsersPage() {
  const session = await requireSession();
  if (session.user.role !== UserRole.PRESIDENTE) redirect(ROUTES.HOME);
  return <UserAdministration />;
}
