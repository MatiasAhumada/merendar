import { type Metadata } from "next";
import { LoginScreen } from "@/components/auth/LoginScreen";

export const metadata: Metadata = {
  title: "Ingresar | Solidaridad Activa",
  description: "Acceso de demostración al panel de gestión comunitaria.",
};

export default function LoginPage() {
  return <LoginScreen />;
}
