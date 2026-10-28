"use client";

import { APPLICATION_ERROR_MESSAGES } from "@/constants/error-messages.constant";
import { FAMILY_ERROR_MESSAGES } from "@/constants/family.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { ROUTES } from "@/constants/routes.constant";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircleIcon, CheckmarkCircle01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SYNC_MESSAGES } from "@/constants/offline.constant";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { z } from "zod";
import {
  listOfflineOperations,
  resolveOfflineConflict,
  retryOfflineOperation,
  synchronizeOfflineQueue,
} from "@/services/offline-queue.service";
import type { OfflineOperation } from "@/types/offline-operation";

const duplicateDniSnapshotSchema = z.object({
  kind: z.literal("duplicate_dni"),
  person: z.object({
    firstName: z.string(),
    lastName: z.string(),
    dni: z.string().nullable(),
    families: z.array(z.object({ name: z.string(), neighborhood: z.string(), address: z.string() })),
  }),
});

interface OfflineSyncStatusProps {
  userId: string;
  sessionExpiresAt: string;
  onQueueStatusChange: (count: number, loaded: boolean, readError: boolean) => void;
}

function resourceLabel(resource: OfflineOperation["resource"]) {
  if (resource === "families") {
    return "familias";
  }

  if (resource === "remittances") {
    return "remitos";
  }

  return "registros";
}

function operationStatusVariant(status: OfflineOperation["status"]): "warning" | "destructive" | "secondary" {
  if (status === "conflict") {
    return "warning";
  }

  if (status === "error") {
    return "destructive";
  }

  return "secondary";
}

function operationStatusLabel(operation: OfflineOperation) {
  if (operation.status === "conflict" && operation.resource === "families" && operation.operation === "create") {
    return APPLICATION_UI_TEXT.CONFLICTO_DE_DNI;
  }

  if (operation.status === "conflict") {
    return APPLICATION_UI_TEXT.CONFLICTO;
  }

  if (operation.status === "error") {
    return APPLICATION_UI_TEXT.REQUIERE_ATENCION;
  }

  if (operation.status === "syncing") {
    return APPLICATION_UI_TEXT.SINCRONIZANDO;
  }

  return APPLICATION_UI_TEXT.PENDIENTE;
}

function duplicateDniMessage(operation: OfflineOperation) {
  const snapshot = duplicateDniSnapshotSchema.safeParse(operation.remoteSnapshot);

  if (!snapshot.success) {
    return APPLICATION_ERROR_MESSAGES.EL_PADRON_YA_CONTIENE_UNA_PERSONA_CON_UN_DNI_DE_ESTA_FICHA;
  }

  const person = snapshot.data.person;
  const registeredFamilies = person.families.map((family) => family.name).join(", ");
  let message = FAMILY_ERROR_MESSAGES.DUPLICATE_DNI(person.dni ?? APPLICATION_UI_TEXT.SIN_INFORMAR, `${person.firstName} ${person.lastName}`);

  if (registeredFamilies) {
    message = FAMILY_ERROR_MESSAGES.DUPLICATE_DNI_FAMILIES(message, registeredFamilies);
  }

  return message;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function OfflineSyncStatus({ userId, sessionExpiresAt, onQueueStatusChange }: OfflineSyncStatusProps) {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const synchronizingRef = useRef(false);
  const [message, setMessage] = useState("");
  const isOnline = useNetworkStatus();
  const pendingOperations = operations.filter((operation) => operation.status !== "synced");
  const conflictOperations = pendingOperations.filter((operation) => operation.status === "conflict");
  const errorOperations = pendingOperations.filter((operation) => operation.status === "error");

  const refreshQueue = useCallback(async () => {
    try {
      const nextOperations = await listOfflineOperations(userId);
      setOperations(nextOperations);
      onQueueStatusChange(nextOperations.filter((operation) => operation.status !== "synced").length, true, false);
    } catch (error) {
      setMessage(errorMessage(error, APPLICATION_UI_TEXT.NO_SE_PUDO_CONSULTAR_LA_COLA_OFFLINE));
      onQueueStatusChange(0, true, true);
    }
  }, [onQueueStatusChange, userId]);

  const runSynchronization = useCallback(async () => {
    if (!isOnline || synchronizingRef.current) {
      return;
    }

    synchronizingRef.current = true;
    setIsSyncing(true);

    try {
      await synchronizeOfflineQueue(userId);
      window.dispatchEvent(new Event("merendar-server-data-changed"));
      await refreshQueue();
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error, APPLICATION_UI_TEXT.NO_SE_PUDO_SINCRONIZAR_LA_COLA));
    } finally {
      synchronizingRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, refreshQueue, userId]);

  async function retryOperation(operationId: string) {
    if (synchronizingRef.current) {
      return;
    }

    synchronizingRef.current = true;
    setIsSyncing(true);

    try {
      await retryOfflineOperation(userId, operationId);
      await refreshQueue();
    } catch (error) {
      setMessage(errorMessage(error, APPLICATION_UI_TEXT.NO_SE_PUDO_REINTENTAR_EL_CAMBIO));
    } finally {
      synchronizingRef.current = false;
      setIsSyncing(false);
    }
  }

  async function resolveConflict(operationId: string, resolution: "local" | "server") {
    if (!isOnline || isSyncing) {
      return;
    }

    synchronizingRef.current = true;
    setIsSyncing(true);

    try {
      await resolveOfflineConflict(userId, operationId, resolution);
      await refreshQueue();
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error, APPLICATION_UI_TEXT.NO_SE_PUDO_RESOLVER_EL_CONFLICTO));
    } finally {
      synchronizingRef.current = false;
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    void refreshQueue();
    const refreshListener = () => void refreshQueue();
    const onlineListener = () => void runSynchronization();
    window.addEventListener("offline-queue-change", refreshListener);
    window.addEventListener("online", onlineListener);

    return () => {
      window.removeEventListener("offline-queue-change", refreshListener);
      window.removeEventListener("online", onlineListener);
    };
  }, [refreshQueue, runSynchronization]);

  useEffect(() => {
    if (isOnline) {
      void runSynchronization();
    }
  }, [isOnline, runSynchronization]);

  if (!pendingOperations.length && !message) {
    return null;
  }

  const hasSessionExpired = Date.now() >= Date.parse(sessionExpiresAt) ||
    pendingOperations.some((operation) => Date.now() >= Date.parse(operation.sessionExpiresAt));
  let alertVariant: "destructive" | "info" = "info";
  let alertTitle: string = APPLICATION_UI_TEXT.CAMBIOS_PENDIENTES_DE_SINCRONIZACION;
  let alertIcon = CheckmarkCircle01Icon;
  let connectionMessage: string = APPLICATION_ERROR_MESSAGES.LOS_CAMBIOS_SE_ENVIAN_CON_LA_SESION_Y_LOS_PERMISOS_ACTUALES_DE_ESTA_CUENTA;

  if (conflictOperations.length) {
    alertVariant = "info";
    alertTitle = APPLICATION_UI_TEXT.CAMBIOS_PARA_RESOLVER;
    alertIcon = AlertCircleIcon;
  } else if (errorOperations.length) {
    alertVariant = "destructive";
    alertTitle = APPLICATION_UI_TEXT.CAMBIOS_PENDIENTES_DE_ATENCION;
    alertIcon = AlertCircleIcon;
  }

  if (hasSessionExpired) {
    connectionMessage = SYNC_MESSAGES.SESSION_EXPIRED;
  } else if (!isOnline) {
    connectionMessage = APPLICATION_UI_TEXT.LOS_CAMBIOS_QUEDAN_GUARDADOS_EN_ESTE_DISPOSITIVO_Y_SE_SINCRONIZAN_AL_RECUP;
  }

  return (
    <section aria-label={APPLICATION_UI_TEXT.SINCRONIZACION_DE_CAMBIOS} className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <Alert variant={alertVariant} className={conflictOperations.length ? "border-warning/40 text-warning" : undefined}>
        <HugeiconsIcon icon={alertIcon} strokeWidth={1.8} />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          {alertTitle}
          <Badge variant="secondary">{pendingOperations.length}</Badge>
        </AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            {connectionMessage}
          </p>
          {pendingOperations.map((operation) => (
            <div key={operation.operationId} className="rounded-lg border border-border bg-card p-3 text-card-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{APPLICATION_UI_TEXT.CAMBIO_DE}{resourceLabel(operation.resource)}</p>
                <Badge variant={operationStatusVariant(operation.status)}>
                  {operationStatusLabel(operation)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {APPLICATION_UI_TEXT.GUARDADO_EN_ESTE_DISPOSITIVO}{new Date(operation.createdAt).toLocaleString("es-AR")}
              </p>
              {operation.message ? <p className="mt-2 text-sm text-muted-foreground">{operation.message}</p> : null}
              {operation.status === "conflict" ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm">{operation.resource === "families" && operation.operation === "create" ? duplicateDniMessage(operation) : APPLICATION_UI_TEXT.OTRA_PERSONA_ACTUALIZO_ESTE_REGISTRO_ELEGI_QUE_VERSION_CONSERVAR}</p>
                  {operation.remoteSnapshot ? (
                    <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(operation.remoteSnapshot, null, 2)}</pre>
                  ) : null}
                  {operation.resource === "families" && operation.operation === "create" ? (
                    <Button asChild size="sm" variant="outline"><a href={ROUTES.FAMILIES}>{APPLICATION_UI_TEXT.ABRIR_PADRON_PARA_CORREGIR_EL_BORRADOR}</a></Button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void resolveConflict(operation.operationId, "local")} disabled={!isOnline || isSyncing}>
                        {APPLICATION_UI_TEXT.CONSERVAR_MI_CAMBIO}</Button>
                      <Button size="sm" variant="outline" onClick={() => void resolveConflict(operation.operationId, "server")} disabled={!isOnline || isSyncing}>
                        {APPLICATION_UI_TEXT.USAR_VERSION_DEL_SERVIDOR}</Button>
                    </div>
                  )}
                </div>
              ) : null}
              {operation.status === "error" ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => void retryOperation(operation.operationId)} disabled={!isOnline || isSyncing}>
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />
                  {APPLICATION_UI_TEXT.REINTENTAR}</Button>
              ) : null}
            </div>
          ))}
          {message ? <p role="alert" className="text-sm">{message}</p> : null}
          <Button size="sm" variant="outline" onClick={() => void runSynchronization()} disabled={!isOnline || isSyncing || !pendingOperations.length}>
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />
            {isSyncing ? APPLICATION_UI_TEXT.SINCRONIZANDO : APPLICATION_UI_TEXT.SINCRONIZAR_AHORA}
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  );
}
