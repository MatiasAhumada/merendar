"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircleIcon, CheckmarkCircle01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SYNC_MESSAGES } from "@/constants/offline.constant";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  listOfflineOperations,
  resolveOfflineConflict,
  retryOfflineOperation,
  synchronizeOfflineQueue,
} from "@/services/offline-queue.service";
import type { OfflineOperation } from "@/types/offline-operation";

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

function operationStatusLabel(status: OfflineOperation["status"]) {
  if (status === "conflict") {
    return "Conflicto";
  }

  if (status === "error") {
    return "Requiere atención";
  }

  if (status === "syncing") {
    return "Sincronizando";
  }

  return "Pendiente";
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
      setMessage(errorMessage(error, "No se pudo consultar la cola offline."));
      onQueueStatusChange(0, true, true);
    }
  }, [onQueueStatusChange, userId]);

  const runSynchronization = useCallback(async () => {
    if (!isOnline || isSyncing) {
      return;
    }

    setIsSyncing(true);

    try {
      await synchronizeOfflineQueue(userId);
      await refreshQueue();
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error, "No se pudo sincronizar la cola."));
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, refreshQueue, userId]);

  async function retryOperation(operationId: string) {
    setIsSyncing(true);

    try {
      await retryOfflineOperation(userId, operationId);
      await refreshQueue();
    } catch (error) {
      setMessage(errorMessage(error, "No se pudo reintentar el cambio."));
    } finally {
      setIsSyncing(false);
    }
  }

  async function resolveConflict(operationId: string, resolution: "local" | "server") {
    if (!isOnline || isSyncing) {
      return;
    }

    setIsSyncing(true);

    try {
      await resolveOfflineConflict(userId, operationId, resolution);
      await refreshQueue();
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error, "No se pudo resolver el conflicto."));
    } finally {
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
  let alertTitle = "Cambios pendientes de sincronización";
  let alertIcon = CheckmarkCircle01Icon;
  let connectionMessage = "Los cambios se envían con la sesión y los permisos actuales de esta cuenta.";

  if (conflictOperations.length) {
    alertVariant = "info";
    alertTitle = "Cambios para resolver";
    alertIcon = AlertCircleIcon;
  } else if (errorOperations.length) {
    alertVariant = "destructive";
    alertTitle = "Cambios pendientes de atención";
    alertIcon = AlertCircleIcon;
  }

  if (hasSessionExpired) {
    connectionMessage = SYNC_MESSAGES.SESSION_EXPIRED;
  } else if (!isOnline) {
    connectionMessage = "Los cambios quedan guardados en este dispositivo y se sincronizan al recuperar conexión.";
  }

  return (
    <section aria-label="Sincronización de cambios" className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
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
                <p className="font-medium">Cambio de {resourceLabel(operation.resource)}</p>
                <Badge variant={operationStatusVariant(operation.status)}>
                  {operationStatusLabel(operation.status)}
                </Badge>
              </div>
              {operation.message ? <p className="mt-2 text-sm text-muted-foreground">{operation.message}</p> : null}
              {operation.status === "conflict" ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm">Otra persona actualizó este registro. Elegí qué versión conservar.</p>
                  {operation.remoteSnapshot ? (
                    <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">{JSON.stringify(operation.remoteSnapshot, null, 2)}</pre>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void resolveConflict(operation.operationId, "local")} disabled={!isOnline || isSyncing}>
                      Conservar mi cambio
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void resolveConflict(operation.operationId, "server")} disabled={!isOnline || isSyncing}>
                      Usar versión del servidor
                    </Button>
                  </div>
                </div>
              ) : null}
              {operation.status === "error" ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => void retryOperation(operation.operationId)} disabled={!isOnline || isSyncing}>
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />
                  Reintentar
                </Button>
              ) : null}
            </div>
          ))}
          {message ? <p role="alert" className="text-sm">{message}</p> : null}
          <Button size="sm" variant="outline" onClick={() => void runSynchronization()} disabled={!isOnline || isSyncing || !pendingOperations.length}>
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />
            {isSyncing ? "Sincronizando…" : "Sincronizar ahora"}
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  );
}
