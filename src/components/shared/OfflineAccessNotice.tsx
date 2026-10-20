import { HugeiconsIcon } from "@hugeicons/react";
import { CloudOffIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function OfflineAccessNotice() {
  return (
    <Alert variant="info">
      <HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} />
      <AlertTitle>Volvé a conectarte para continuar</AlertTitle>
      <AlertDescription>
        Iniciar o cerrar sesión, consultar información, administrar cuentas y guardar cambios requieren conexión. No se guardan operaciones sin conexión.
      </AlertDescription>
    </Alert>
  );
}
