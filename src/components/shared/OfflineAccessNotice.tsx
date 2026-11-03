import { HugeiconsIcon } from "@hugeicons/react";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { CloudOffIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function OfflineAccessNotice() {
  return (
    <Alert variant="info">
      <HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} />
      <AlertTitle>{APPLICATION_UI_TEXT.VOLVE_A_CONECTARTE_PARA_CONTINUAR}</AlertTitle>
      <AlertDescription>
        {APPLICATION_UI_TEXT.INICIAR_O_CERRAR_SESION_Y_CONSULTAR_OTRAS_VISTAS_REQUIEREN_CONEXION_SI_T}</AlertDescription>
    </Alert>
  );
}
