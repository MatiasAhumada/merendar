import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH } from "@/constants/auth.constant";
import { ROUTES } from "@/constants/routes.constant";
import { authService } from "@/server/services/auth.service";
import "server-only";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return authService.getSession(cookieStore.get(AUTH.SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect(ROUTES.LOGIN);
  }

  return session;
}
