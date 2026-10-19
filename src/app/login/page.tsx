import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { getCurrentSession } from "@/server/services/auth-session";
import { ROUTES } from "@/constants/routes";

export const metadata: Metadata = {
  title: "Ingresar | Solidaridad Activa",
  description: "Acceso al panel de gestión comunitaria.",
};

export default async function LoginPage() {
  const session = await getCurrentSession();

  if (session) {
    redirect(ROUTES.HOME);
  }

  return <LoginScreen />;
}
