"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudOffIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/constants/brand.constant";
import { OFFLINE_PREPARATION, type OfflinePreparedRoute } from "@/constants/offline.constant";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  readActiveOfflineAccount,
  readOfflinePreparedWorkspace,
  type OfflinePreparation,
  type OfflinePreparedDocument,
} from "@/services/offline-preparation.service";
import type { JsonValue } from "@/types/json-value";

const ROUTE_LABELS: Record<OfflinePreparedRoute, string> = {
  "/": "Inicio",
  "/familias": "Familias",
  "/mercaderia": "Módulos y rendiciones",
  "/entrega": "Registro",
  "/usuarios": "Usuarios",
  "/permisos": "Permisos",
};

const SNAPSHOT_ARRAY_KEYS = ["families", "periods", "users", "roles", "records", "sheets"] as const;
const SNAPSHOT_LABEL_KEYS = ["name", "label", "periodLabel", "fullName", "requestNumber", "remittanceNumber", "id"] as const;
const offlineRouteSchema = z.enum(OFFLINE_PREPARATION.ROUTES);

function recordFrom(value: JsonValue): Record<string, JsonValue> | null {
  const parsedRecord = z.record(z.string(), z.json()).safeParse(value);
  return parsedRecord.success ? parsedRecord.data : null;
}

function firstArray(value: JsonValue) {
  const record = recordFrom(value);
  if (!record) {
    return [];
  }

  for (const key of SNAPSHOT_ARRAY_KEYS) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function itemLabel(value: JsonValue, index: number) {
  const record = recordFrom(value);
  if (!record) {
    return `Registro ${index + 1}`;
  }

  for (const key of SNAPSHOT_LABEL_KEYS) {
    const candidate = record[key];
    const parsedLabel = z.string().safeParse(candidate);
    if (parsedLabel.success && parsedLabel.data.trim()) {
      return parsedLabel.data;
    }
  }

  return `Registro ${index + 1}`;
}

function routeFromSearch(search: string): OfflinePreparedRoute {
  const routeValue = new URLSearchParams(search).get("route");
  if (!routeValue) {
    return "/";
  }

  const routePath = routeValue.split("?")[0];
  const parsedRoute = offlineRouteSchema.safeParse(routePath);
  return parsedRoute.success ? parsedRoute.data : "/";
}

function subscribeToRouteChange(onRouteChange: () => void) {
  window.addEventListener("popstate", onRouteChange);
  return () => window.removeEventListener("popstate", onRouteChange);
}

function currentSearch() {
  return window.location.search;
}

function serverSearch() {
  return "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function SnapshotSummary({ snapshot }: { snapshot: JsonValue }) {
  const entries = firstArray(snapshot);

  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">La ruta está autorizada y preparada. Los datos detallados se conservan en el almacenamiento local de esta cuenta.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{entries.length} registro(s) guardados al preparar esta vista.</p>
      <ul className="divide-y rounded-lg border">
        {entries.slice(0, 8).map((entry, index) => (
          <li key={`${itemLabel(entry, index)}-${index}`} className="px-3 py-2 text-sm">
            {itemLabel(entry, index)}
          </li>
        ))}
      </ul>
      {entries.length > 8 ? <p className="text-xs text-muted-foreground">Hay {entries.length - 8} registros más guardados.</p> : null}
    </div>
  );
}

function PreparedDocumentLink({ document }: { document: OfflinePreparedDocument }) {
  const [localDocumentUrl] = useState(() => URL.createObjectURL(document.content));

  useEffect(() => () => URL.revokeObjectURL(localDocumentUrl), [localDocumentUrl]);

  return (
    <Button asChild variant="outline" size="sm">
      <a href={localDocumentUrl} target="_blank" rel="noreferrer" download={document.originalName}>Abrir documento</a>
    </Button>
  );
}

function PreparedDocuments({ documents }: { documents: OfflinePreparedDocument[] }) {
  if (!documents.length) {
    return null;
  }

  return (
    <section aria-labelledby="offline-documents-title" className="mt-5 space-y-3">
      <h2 id="offline-documents-title" className="font-display text-base font-semibold">Documentos preparados</h2>
      <ul className="space-y-2">
        {documents.map((document) => (
          <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{document.originalName}</p>
              <p className="text-xs text-muted-foreground">{Math.ceil(document.byteSize / 1024)} KB · copia privada de esta cuenta</p>
            </div>
            <PreparedDocumentLink document={document} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreparedRoute({ route, preparation, documents }: { route: OfflinePreparedRoute; preparation: OfflinePreparation; documents: OfflinePreparedDocument[] }) {
  const snapshot = preparation.snapshots[route];

  if (!snapshot) {
    return (
      <Alert variant="info">
        <AlertTitle>Esta vista no está preparada</AlertTitle>
        <AlertDescription>{OFFLINE_PREPARATION.MESSAGES.NOT_PREPARED} Conectate, abrí la app y usá “Preparar offline”.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ROUTE_LABELS[route]}</CardTitle>
        <CardDescription>Datos privados recuperados del almacenamiento local de {preparation.userName}.</CardDescription>
      </CardHeader>
      <CardContent>
        <SnapshotSummary snapshot={snapshot} />
        {route === "/mercaderia" ? <PreparedDocuments documents={documents} /> : null}
      </CardContent>
    </Card>
  );
}

export function OfflineScreen() {
  const isOnline = useNetworkStatus();
  const route = routeFromSearch(useSyncExternalStore(subscribeToRouteChange, currentSearch, serverSearch));
  const [preparation, setPreparation] = useState<OfflinePreparation | null>(null);
  const [documents, setDocuments] = useState<OfflinePreparedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;
    void readActiveOfflineAccount().then((userId) => {
      if (!userId) {
        return null;
      }
      return readOfflinePreparedWorkspace(userId);
    }).then((savedPreparation) => {
      if (isMounted) {
        setPreparation(savedPreparation?.preparation ?? null);
        setDocuments(savedPreparation?.documents ?? []);
      }
    }).catch((error: unknown) => {
      if (isMounted) {
        setLoadError(error instanceof Error ? error.message : "No se pudo leer la preparación offline.");
      }
    }).finally(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  function retryConnection() {
    window.location.assign(route);
  }

  const availableRoutes = OFFLINE_PREPARATION.ROUTES.filter((availableRoute) =>
    availableRoute === "/" || preparation?.snapshots[availableRoute],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 bg-background px-4 py-6 pb-10 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <Image src={BRAND.wordmarkPath} alt={BRAND.name} width={180} height={82} className="h-11 w-auto" priority unoptimized />
        <Badge variant={isOnline ? "success" : "warning"}>{isOnline ? "Con conexión" : "Sin conexión"}</Badge>
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Acceso sin conexión</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          El acceso local solo está disponible después de validar una sesión y preparar las vistas con conexión. La preparación vence con la sesión o a las 12 horas.
        </p>
      </section>

      {preparation ? (
        <Alert variant="info">
          <HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} />
          <AlertTitle>{preparation.userName} · {preparation.roleLabel}</AlertTitle>
          <AlertDescription>Preparado el {formatDate(preparation.preparedAt)}. Disponible hasta {formatDate(preparation.expiresAt)}. Las acciones que requieren servidor estarán disponibles al reconectar.</AlertDescription>
        </Alert>
      ) : null}

      {loadError ? <Alert variant="destructive"><AlertTitle>No se pudo abrir la preparación</AlertTitle><AlertDescription>{loadError}</AlertDescription></Alert> : null}

      {preparation ? (
        <nav aria-label="Vistas preparadas" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {availableRoutes.map((availableRoute) => (
            <Button asChild key={availableRoute} variant={route === availableRoute ? "soft" : "outline"} className="min-h-11 justify-start">
              <a href={`/offline?route=${encodeURIComponent(availableRoute)}`}>{ROUTE_LABELS[availableRoute]}</a>
            </Button>
          ))}
        </nav>
      ) : null}

      {isLoading ? <p role="status" className="text-sm text-muted-foreground">Revisando si este dispositivo tiene vistas preparadas…</p> : null}
      {!isLoading && !preparation ? (
        <Alert variant="info">
          <HugeiconsIcon icon={CloudOffIcon} strokeWidth={1.8} />
          <AlertTitle>No hay una preparación vigente para esta cuenta</AlertTitle>
          <AlertDescription>{OFFLINE_PREPARATION.MESSAGES.NOT_PREPARED} Al recuperar conexión, iniciá sesión y prepará el acceso desde la aplicación.</AlertDescription>
        </Alert>
      ) : null}

      {preparation && !isLoading ? <PreparedRoute route={route} preparation={preparation} documents={documents} /> : null}

      <Card variant="muted" className="mt-auto">
        <CardContent className="flex flex-col items-start gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <HugeiconsIcon icon={isOnline ? RefreshIcon : CloudOffIcon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">{isOnline ? "Podés volver a intentar" : "Los datos de otras cuentas no se muestran"}</p>
              <p className="text-sm text-muted-foreground">Los HTML, respuestas RSC/API y documentos privados no se guardan en la caché del service worker.</p>
            </div>
          </div>
          <Button onClick={retryConnection} disabled={!isOnline} className="w-full sm:w-auto">
            <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />
            Volver a la aplicación
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
