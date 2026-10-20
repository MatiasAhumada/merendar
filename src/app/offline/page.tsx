import type { Metadata } from "next";
import { OfflineScreen } from "@/components/offline/OfflineScreen";

export const metadata: Metadata = {
  title: "Sin conexión",
  description: "Información sobre el acceso a Merendar sin conexión.",
};

export const dynamic = "force-static";

export default function OfflinePage() {
  return <OfflineScreen />;
}
