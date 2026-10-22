import { HugeiconsIcon } from "@hugeicons/react";
import { CloudOffIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function OfflineAccessNotice() {
  return (
    <Alert variant="info">
      <HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} />
      <AlertTitle>Volvé a conectarte para continuar</AlertTitle>
      <AlertDescription>
        Iniciar o cerrar sesión y consultar otras vistas requieren conexión. Si tenés una sesión vigente y el padrón familiar ya estaba abierto, podés registrar familias para sincronizarlas cuando vuelva la conexión.
      </AlertDescription>
    </Alert>
  );
}
