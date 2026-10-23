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
import { Input } from "@/components/ui/input";
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
import { listOfflineOperations } from "@/services/offline-queue.service";
import type { OfflineOperation } from "@/types/offline-operation";
import { FamilyRegistry } from "@/components/families/FamilyRegistry";
import { familyCollectionSchema } from "@/validations/family.validation";
import { DeliveryWorkbench } from "@/components/delivery/DeliveryWorkbench";
import { recordsCollectionSchema } from "@/validations/record.validation";
import { RenditionWorkspace } from "@/components/merchandise/RenditionWorkspace";
import { merchandiseResponseSchema } from "@/components/merchandise/MerchandiseWorkspace";

const ROUTE_LABELS: Record<OfflinePreparedRoute, string> = {
  "/": "Inicio",
  "/familias": "Familias",
  "/mercaderia": "Módulos y rendiciones",
  "/entrega": "Registro",
  "/usuarios": "Usuarios",
  "/permisos": "Permisos",
};

const SNAPSHOT_LABEL_KEYS = ["name", "label", "periodLabel", "fullName", "requestNumber", "remittanceNumber", "id"] as const;
const SNAPSHOT_SECTION_LABELS: Record<string, string> = {
  families: "Familias",
  periods: "Períodos",
  requests: "Solicitudes",
  quotas: "Cupos",
  remittances: "Remitos",
  records: "Registros",
  sheets: "Planillas",
  renditions: "Rendiciones",
  documents: "Documentos",
  users: "Cuentas",
  roles: "Roles",
  policies: "Permisos",
  history: "Cambios de permisos",
};
const offlineRouteSchema = z.enum(OFFLINE_PREPARATION.ROUTES);

function recordFrom(value: JsonValue): Record<string, JsonValue> | null {
  const parsedRecord = z.record(z.string(), z.json()).safeParse(value);
  return parsedRecord.success ? parsedRecord.data : null;
}

function snapshotSections(value: JsonValue, searchTerm: string) {
  const record = recordFrom(value);
  if (!record) {
    return [];
  }

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("es-AR");
  return Object.entries(record).flatMap(([key, candidate]) => {
    if (!Array.isArray(candidate)) {
      return [];
    }

    const filteredEntries = candidate.filter((entry) =>
      !normalizedSearch || (JSON.stringify(entry) ?? "").toLocaleLowerCase("es-AR").includes(normalizedSearch),
    );
    return [{
      key,
      label: SNAPSHOT_SECTION_LABELS[key] ?? key,
      entries: filteredEntries,
      totalCount: candidate.length,
    }];
  });
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

function operationLabel(operation: OfflineOperation) {
  const renditionReview = z.object({ kind: z.literal("rendition_review") }).safeParse(operation.payload);
  if (operation.resource === "renditions" && renditionReview.success) {
    return "Revisión manual pendiente";
  }

  if (operation.operation === "create") {
    return "Alta";
  }
  if (operation.operation === "update") {
    return "Modificación";
  }
  return "Baja";
}

function pendingOperationVariant(status: OfflineOperation["status"]): "warning" | "destructive" | "secondary" {
  if (status === "error") {
    return "destructive";
  }
  if (status === "conflict") {
    return "warning";
  }
  return "secondary";
}

function pendingOperationStatus(status: OfflineOperation["status"]) {
  if (status === "error") {
    return "Requiere atención";
  }
  if (status === "conflict") {
    return "Conflicto";
  }
  if (status === "syncing") {
    return "Sincronizando";
  }
  return "Pendiente";
}

function SnapshotSummary({ snapshot, searchTerm }: { snapshot: JsonValue; searchTerm: string }) {
  const sections = snapshotSections(snapshot, searchTerm);

  if (!sections.length) {
    return <p className="text-sm text-muted-foreground">La ruta está autorizada y preparada. Los datos detallados se conservan en el almacenamiento local de esta cuenta.</p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.key} aria-label={section.label} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{section.label}</h3>
            <Badge variant="secondary">{section.entries.length} de {section.totalCount}</Badge>
          </div>
          {section.entries.length ? (
            <ul className="divide-y rounded-lg border">
              {section.entries.slice(0, 40).map((entry, index) => (
                <li key={`${itemLabel(entry, index)}-${index}`} className="px-3 py-2 text-sm">
                  {itemLabel(entry, index)}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">No hay resultados para esta búsqueda.</p>}
          {section.entries.length > 40 ? <p className="text-xs text-muted-foreground">Se muestran 40 de {section.entries.length} coincidencias.</p> : null}
        </section>
      ))}
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

function PendingOperations({ operations }: { operations: OfflineOperation[] }) {
  const pendingOperations = operations.filter((operation) => operation.status !== "synced");

  return (
    <section aria-labelledby="offline-pending-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="offline-pending-title" className="font-display text-base font-semibold">Cambios pendientes</h2>
        <Badge variant={pendingOperations.length ? "warning" : "success"}>{pendingOperations.length}</Badge>
      </div>
      {pendingOperations.length ? (
        <ul className="divide-y rounded-lg border">
          {pendingOperations.map((operation) => (
            <li key={operation.operationId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div>
                <p className="text-sm font-medium">{operationLabel(operation)} · {operation.resourceId}</p>
                <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(operation.createdAt))}</p>
              </div>
              <Badge variant={pendingOperationVariant(operation.status)}>{pendingOperationStatus(operation.status)}</Badge>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No hay cambios pendientes en esta cuenta.</p>}
    </section>
  );
}

function PreparedRenditionWorkspace({
  initialPeriods,
  preparation,
  preparationIsValid,
  documents,
}: {
  initialPeriods: z.infer<typeof merchandiseResponseSchema>['periods'];
  preparation: OfflinePreparation;
  preparationIsValid: boolean;
  documents: OfflinePreparedDocument[];
}) {
  const [periods, setPeriods] = useState(initialPeriods);

  async function refreshPeriods() {
    const response = await fetch("/api/merchandise", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      throw new Error("No se pudieron actualizar las rendiciones al recuperar conexión.");
    }

    const parsedResponse = merchandiseResponseSchema.safeParse(await response.json());
    if (!parsedResponse.success) {
      throw new Error("La respuesta actualizada de rendiciones no tiene un formato válido.");
    }

    setPeriods(parsedResponse.data.periods);
  }

  return <RenditionWorkspace
    periods={periods}
    userId={preparation.userId}
    sessionExpiresAt={preparation.sessionExpiresAt}
    onRefresh={refreshPeriods}
    canWrite={preparationIsValid && preparation.capabilities.includes("renditions.write")}
    canReview={preparationIsValid && preparation.capabilities.includes("renditions.review")}
    canCreatePeriods={false}
    periodStatus="ready"
    offlineMode
    preparedDocuments={documents}
  />;
}

function PreparedRoute({ route, preparation, preparationIsValid, documents, operations, searchTerm, setSearchTerm }: { route: OfflinePreparedRoute; preparation: OfflinePreparation; preparationIsValid: boolean; documents: OfflinePreparedDocument[]; operations: OfflineOperation[]; searchTerm: string; setSearchTerm: (value: string) => void }) {
  const snapshot = preparation.snapshots[route]?.data;

  if (!snapshot) {
    return (
      <Alert variant="info">
        <AlertTitle>Esta vista no está preparada</AlertTitle>
        <AlertDescription>{OFFLINE_PREPARATION.MESSAGES.NOT_PREPARED} Conectate, abrí la app y usá “Preparar offline”.</AlertDescription>
      </Alert>
    );
  }

  if (route === "/familias") {
    const familySnapshot = familyCollectionSchema.safeParse(snapshot);
    if (familySnapshot.success) {
      return (
        <div className="space-y-4">
          <Alert variant="info">
            <AlertTitle>Ficha familiar preparada</AlertTitle>
            <AlertDescription>Captura de {formatDate(preparation.snapshots[route].capturedAt)}. Los cambios quedan pendientes hasta reconectar.</AlertDescription>
          </Alert>
          <FamilyRegistry
            initialFamilies={familySnapshot.data.families}
            userId={preparation.userId}
            sessionExpiresAt={preparation.sessionExpiresAt}
            canWrite={preparationIsValid && preparation.capabilities.includes("families.write")}
          />
        </div>
      );
    }
  }

  if (route === "/entrega") {
    const recordsSnapshot = recordsCollectionSchema.safeParse(snapshot);
    if (recordsSnapshot.success) {
      return (
        <div className="space-y-4">
          <Alert variant="info">
            <AlertTitle>Registro preparado</AlertTitle>
            <AlertDescription>Captura de {formatDate(preparation.snapshots[route].capturedAt)}. Los registros y borradores PDF quedan pendientes hasta validarse con el servidor.</AlertDescription>
          </Alert>
          <DeliveryWorkbench
            userId={preparation.userId}
            sessionExpiresAt={preparation.sessionExpiresAt}
            canWrite={preparationIsValid && preparation.capabilities.includes("delivery.write")}
            canCreateFamilies={preparationIsValid && preparation.capabilities.includes("families.write")}
            canCreatePeriods={preparationIsValid && preparation.capabilities.includes("merchandise.write")}
            offlineMode
            initialOfflineData={recordsSnapshot.data}
            preparedDocuments={documents}
          />
          <div className="mt-4"><PendingOperations operations={operations} /></div>
        </div>
      );
    }
  }

  if (route === "/mercaderia") {
    const merchandiseSnapshot = merchandiseResponseSchema.safeParse(snapshot);
    if (merchandiseSnapshot.success) {
      return (
        <div className="space-y-4">
          <Alert variant="info">
            <AlertTitle>Rendiciones preparadas</AlertTitle>
            <AlertDescription>Períodos, planillas y documentos disponibles al {formatDate(preparation.snapshots[route].capturedAt)}. Las cargas y revisiones pendientes se sincronizan con validación del servidor.</AlertDescription>
          </Alert>
          <PreparedRenditionWorkspace
            initialPeriods={merchandiseSnapshot.data.periods}
            preparation={preparation}
            preparationIsValid={preparationIsValid}
            documents={documents}
          />
        </div>
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ROUTE_LABELS[route]}</CardTitle>
        <CardDescription>Datos privados recuperados del almacenamiento local de {preparation.userName}.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-muted-foreground">Lectura capturada {formatDate(preparation.snapshots[route].capturedAt)} · esquema {preparation.snapshots[route].schemaVersion}</p>
        <Input aria-label="Filtrar datos preparados" placeholder="Filtrar datos preparados" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        <div className="mt-4"><SnapshotSummary snapshot={snapshot} searchTerm={searchTerm} /></div>
        <div className="mt-6"><PendingOperations operations={operations} /></div>
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
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [queueError, setQueueError] = useState("");
  const [preparationIsValid, setPreparationIsValid] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;
    void readActiveOfflineAccount().then(async (userId) => {
      if (!userId) {
        return null;
      }

      const workspace = await readOfflinePreparedWorkspace(userId);
      let queuedOperations: OfflineOperation[] = [];
      try {
        queuedOperations = await listOfflineOperations(userId);
      } catch (error: unknown) {
        let message = "La cola offline tiene un formato que esta versión no reconoce.";
        if (error instanceof Error) {
          message = error.message;
        }
        if (isMounted) {
          setQueueError(message);
        }
      }

      return { workspace, queuedOperations };
    }).then((savedPreparation) => {
      if (isMounted) {
        const savedPreparationValue = savedPreparation?.workspace.preparation ?? null;
        setPreparation(savedPreparationValue);
        let preparationIsValid = false;
        if (savedPreparationValue) {
          preparationIsValid = Date.now() < Date.parse(savedPreparationValue.sessionExpiresAt) && Date.now() < Date.parse(savedPreparationValue.expiresAt);
        }
        setPreparationIsValid(preparationIsValid);
        setDocuments(savedPreparation?.workspace.documents ?? []);
        setOperations(savedPreparation?.queuedOperations ?? []);
      }
    }).catch((error: unknown) => {
      if (isMounted) {
        let message = "No se pudo leer la preparación offline.";

        if (error instanceof Error) {
          message = error.message;
        }

        setLoadError(message);
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

  useEffect(() => {
    const activeUserId = preparation?.userId;
    if (!activeUserId) {
      return;
    }

    const refreshQueue = () => {
      void listOfflineOperations(activeUserId).then((queuedOperations) => {
        setOperations(queuedOperations);
        setQueueError("");
      }).catch((error: unknown) => {
        let message = "La cola offline tiene un formato que esta versión no reconoce.";
        if (error instanceof Error) {
          message = error.message;
        }
        setQueueError(message);
      });
    };

    window.addEventListener("offline-queue-change", refreshQueue);
    return () => window.removeEventListener("offline-queue-change", refreshQueue);
  }, [preparation]);

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
      {queueError ? <Alert variant="info"><AlertTitle>La preparación está disponible; la cola requiere atención</AlertTitle><AlertDescription>{queueError} Los documentos preparados se conservan y se pueden leer mientras resolvés los cambios pendientes.</AlertDescription></Alert> : null}

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

      {preparation && !isLoading ? <PreparedRoute route={route} preparation={preparation} preparationIsValid={preparationIsValid} documents={documents} operations={operations} searchTerm={searchTerm} setSearchTerm={setSearchTerm} /> : null}

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
