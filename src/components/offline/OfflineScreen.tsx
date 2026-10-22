"use client";

import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudOffIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/constants/brand.constant";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function OfflineScreen() {
  const isOnline = useNetworkStatus();

  function retryConnection() {
    window.location.assign("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg overflow-hidden">
        <div className="h-2 bg-primary" />
        <CardHeader className="items-center px-6 pt-10 text-center sm:px-10">
          <Image src={BRAND.wordmarkPath} alt={BRAND.name} width={220} height={100} className="mb-5 h-16 w-auto" priority unoptimized />
          <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} className="size-7" />
          </div>
          <CardTitle className="font-display text-2xl">
            {isOnline ? "Merendar no está disponible" : "Estás sin conexión"}
          </CardTitle>
          <CardDescription className="max-w-sm text-sm leading-relaxed">
            {isOnline
              ? "La app no respondió. Intentá de nuevo cuando el servicio vuelva a estar disponible."
              : "Podés abrir esta pantalla desde la app instalada. Para ingresar, consultar información y guardar cambios necesitás conexión a internet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-8 sm:px-10">
          <Alert variant="info" className="mb-5">
            <HugeiconsIcon icon={isOnline ? RefreshIcon : CloudOffIcon} strokeWidth={1.8} />
            <AlertTitle>{isOnline ? "No se pudo abrir la app" : "Sin conexión"}</AlertTitle>
            <AlertDescription>
              {isOnline
                ? "Tu conexión está activa. Podés reintentar la carga."
                : "El acceso offline se limita a esta pantalla pública. No guardamos datos de cuentas en este dispositivo."}
            </AlertDescription>
          </Alert>
          <Button className="w-full" onClick={retryConnection} disabled={!isOnline}>
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />
            Volver a intentar
          </Button>
          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            En iPhone y iPad, agregá Merendar a la pantalla de inicio desde el menú Compartir de Safari.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
