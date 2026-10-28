import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { getCurrentSession } from "@/server/services/auth-session";
import { ROUTES } from "@/constants/routes.constant";
import { BRAND } from "@/constants/brand.constant";
import { AUTH_UI_TEXT } from "@/constants/auth.constant";

export const metadata: Metadata = {
  title: AUTH_UI_TEXT.INGRESAR,
  description: AUTH_UI_TEXT.LOGIN_PAGE_DESCRIPTION(BRAND.shortName),
};

export default async function LoginPage() {
  const session = await getCurrentSession();

  if (session) {
    redirect(ROUTES.HOME);
  }

  return <LoginScreen />;
}
