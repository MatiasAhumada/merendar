import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { getCurrentSession } from "@/server/services/auth-session";
import { ROUTES } from "@/constants/routes";
import { BRAND } from "@/constants/brand.constant";

export const metadata: Metadata = {
  title: `Ingresar | ${BRAND.shortName}`,
  description: `Acceso al panel de gestión de ${BRAND.shortName}.`,
};

export default async function LoginPage() {
  const session = await getCurrentSession();

  if (session) {
    redirect(ROUTES.HOME);
  }

  return <LoginScreen />;
}
