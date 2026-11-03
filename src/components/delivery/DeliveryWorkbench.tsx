"use client";

import { DELIVERY_ERROR_MESSAGES, DELIVERY_UI_TEXT } from "@/constants/delivery.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { API_ROUTES } from "@/constants/routes.constant";
import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon, Download04Icon, File01Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listOfflineOperations, synchronizeOfflineQueue } from "@/services/offline-queue.service";
import { readOfflinePreparedDocuments, type OfflinePreparedDocument } from "@/services/offline-preparation.service";
import { distributionRecordPayloadSchema } from "@/schemas/record.schema";
import type { RecordsCollection } from "@/types/schema-contracts";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getDeliveryCollection } from "@/services/client/delivery-data.service";
import Link from "next/link";

import type { OfflineOperation } from "@/types/offline-operation";

import { DistributionPreparationPanel } from "@/components/delivery/DistributionPreparationPanel";
import { FamilyDeliveryPanel } from "@/components/delivery/FamilyDeliveryPanel";

type WorkbenchData = RecordsCollection;

interface DeliveryWorkbenchProps {
  userId: string;
  sessionExpiresAt: string;
  canWrite: boolean;
  canCreatePeriods: boolean;
  canReadMerchandise: boolean;
  offlineMode?: boolean;
  initialOfflineData?: WorkbenchData;
  preparedDocuments?: OfflinePreparedDocument[];
}

const emptyData: WorkbenchData = { periods: [], families: [], records: [], sheets: [], moduleReceipts: [], supplyReceipts: [], distributionEvents: [] };

function personLabel(person: WorkbenchData["families"][number]["members"][number]["person"]) {
  return `${person.firstName} ${person.lastName}`;
}

export function DeliveryWorkbench({ userId, sessionExpiresAt, canWrite, canCreatePeriods, canReadMerchandise, initialOfflineData, preparedDocuments = [] }: DeliveryWorkbenchProps) {
  const isOnline = useNetworkStatus();
  const offlineMode = !isOnline;
  const [data, setData] = useState<WorkbenchData>(initialOfflineData ?? emptyData);
  const [periodId, setPeriodId] = useState(initialOfflineData?.periods[0]?.id ?? "");
  const [isLoading, setIsLoading] = useState(!offlineMode);
  const [hasLoadedData, setHasLoadedData] = useState(Boolean(initialOfflineData));
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [offlineOperations, setOfflineOperations] = useState<OfflineOperation[]>([]);
  const [offlineDocuments, setOfflineDocuments] = useState(preparedDocuments);
  const [isSynchronizing, setIsSynchronizing] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await getDeliveryCollection(userId, isOnline);
    setData(result.data);
    setHasLoadedData(true);
    setLoadFailed(false);

    if (!periodId && result.data.periods[0]) {
      setPeriodId(result.data.periods[0].id);
    }
  }, [isOnline, periodId, userId]);

  useEffect(() => {
    let cancelled = false;

    if (offlineMode) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError("");
    setLoadFailed(false);
    fetchData()
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setLoadFailed(true);
          if (loadError instanceof Error) {
            setError(loadError.message);
          } else {
            setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_CARGAR_EL_REGISTRO);
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchData, offlineMode]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listOfflineOperations(userId), readOfflinePreparedDocuments(userId)]).then(([operations, documents]) => {
      if (!cancelled) {
        setOfflineOperations(operations);
        setOfflineDocuments(documents);
      }
    }).catch(() => {
      if (!cancelled) {
        setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDIERON_LEER_LOS_CAMBIOS_Y_DOCUMENTOS_GUARDADOS_EN_ESTE_DISPOSITIVO);
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  const selectedPeriod = data.periods.find((period) => period.id === periodId);
  const isFamilyPeriod = selectedPeriod?.destination === "FAMILIES";
  const currentRecords = data.records.filter((record) => record.periodId === periodId);
  const currentSheets = data.sheets.filter((sheet) => sheet.periodId === periodId);
  const queuedRecordOperations = offlineOperations.flatMap((operation) => {
    if (operation.resource !== "records") {
      return [];
    }
    const payload = distributionRecordPayloadSchema.safeParse(operation.payload);
    return payload.success && payload.data.periodId === periodId ? [{ operation, payload: payload.data }] : [];
  });
  const currentRecordIds = new Set(currentRecords.map((record) => record.id));
  const additionalRecordOperations = queuedRecordOperations
    .filter(({ operation }) => !currentRecordIds.has(operation.resourceId))
    .filter(({ operation, payload }) => operation.status !== "synced" || (data.periods.some((period) => period.id === payload.periodId) && (offlineMode || loadFailed)));
  let connectionLabel: string = DELIVERY_UI_TEXT.SIN_CONEXION;
  let connectionVariant: "success" | "warning" = "warning";

  if (offlineMode) {
    connectionLabel = "Vista local";
  } else if (isOnline) {
    connectionLabel = DELIVERY_UI_TEXT.CONECTADO;
    connectionVariant = "success";
  }
  let periodAvailabilityMessage = "";
  if (isLoading) {
    periodAvailabilityMessage = "Cargando períodos…";
  } else if (!isOnline && !hasLoadedData) {
    periodAvailabilityMessage = DELIVERY_UI_TEXT.NO_HAY_PERIODOS_PREPARADOS_EN_ESTA_VISTA_SIN_CONEXION;
  } else if (loadFailed && !hasLoadedData) {
    periodAvailabilityMessage = DELIVERY_UI_TEXT.NO_SE_PUDO_CONFIRMAR_SI_HAY_PERIODOS_REINTENTA_LA_CARGA_PARA_ACTUALIZAR_LA;
  } else {
    if (!data.periods.length) {
      periodAvailabilityMessage = DELIVERY_UI_TEXT.NO_HAY_PERIODOS_CARGADOS;
    }
  }

  async function retryData() {
    setIsLoading(true);
    setLoadFailed(false);
    setError("");

    try {
      await fetchData();
    } catch (loadError) {
      setLoadFailed(true);
      if (loadError instanceof Error) {
        setError(loadError.message);
      } else {
        setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_CARGAR_EL_REGISTRO);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function synchronizePendingChanges() {
    setIsSynchronizing(true);
    setError("");
    try {
      await synchronizeOfflineQueue(userId);
      setOfflineOperations(await listOfflineOperations(userId));
      await fetchData();
      setNotice(DELIVERY_UI_TEXT.SE_REVISARON_LOS_CAMBIOS_PENDIENTES_LAS_PLANILLAS_LOCALES_MANTIENEN_SU_CON);
    } catch (syncError) {
      if (syncError instanceof Error) {
        setError(syncError.message);
      } else {
        setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDIERON_SINCRONIZAR_LOS_CAMBIOS_PENDIENTES);
      }
      setOfflineOperations(await listOfflineOperations(userId));
    } finally {
      setIsSynchronizing(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{DELIVERY_UI_TEXT.DISTRIBUCION_COMUNITARIA}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">{DELIVERY_UI_TEXT.BENEFICIARIOS_Y_PLANILLAS}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{DELIVERY_UI_TEXT.REGISTRA_LA_ENTREGA_DEL_MODULO_Y_PREPARA_EL_LISTADO_PARA_IMPRIMIR_Y_FIRM}</p>
        </div>
        <Badge variant={connectionVariant} className="w-fit">{connectionLabel}</Badge>
      </header>

      {error ? <Alert variant="destructive"><AlertTitle>{DELIVERY_UI_TEXT.NO_SE_COMPLETO_LA_OPERACION}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}{loadFailed ? <Button variant="outline" size="sm" onClick={() => void retryData()}>{APPLICATION_UI_TEXT.REINTENTAR}</Button> : null}</AlertDescription></Alert> : null}
      {notice ? <Alert variant="info"><AlertTitle>{DELIVERY_UI_TEXT.ESTADO_DEL_REGISTRO}</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
      {offlineMode && offlineOperations.some((operation) => operation.status !== "synced") ? <Card><CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">{DELIVERY_UI_TEXT.HAY_CAMBIOS_GUARDADOS_EN_ESTE_DISPOSITIVO_AL_RECUPERAR_CONEXION_SINCRONI}</p><Button onClick={() => void synchronizePendingChanges()} disabled={!isOnline || isSynchronizing || !canWrite}>{isSynchronizing ? APPLICATION_UI_TEXT.SINCRONIZANDO : DELIVERY_UI_TEXT.SINCRONIZAR_CAMBIOS}</Button></CardContent></Card> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={Calendar03Icon} className="text-primary" /> {DELIVERY_UI_TEXT.MODULO_O_PERIODO}</CardTitle>
          <CardDescription>{DELIVERY_UI_TEXT.ELEGI_UN_PERIODO_ACTIVO_PARA_CONSULTAR_BENEFICIARIOS_REGISTROS_Y_PLANILL}</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="record-period">{DELIVERY_UI_TEXT.PERIODO}</FieldLabel>
            <Select value={periodId} onValueChange={setPeriodId} disabled={isLoading || !data.periods.length}>
              <SelectTrigger id="record-period" aria-label={DELIVERY_UI_TEXT.SELECCIONAR_MODULO_O_PERIODO}><SelectValue placeholder={DELIVERY_UI_TEXT.SELECCIONAR_UN_PERIODO} /></SelectTrigger>
              <SelectContent>
                {data.periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.label} {APPLICATION_UI_TEXT.TEXT}{period.agency}</SelectItem>)}
              </SelectContent>
            </Select>
            {periodAvailabilityMessage ? <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center"><FieldDescription>{periodAvailabilityMessage}</FieldDescription>{offlineMode && !data.periods.length ? <FieldDescription>{DELIVERY_UI_TEXT.CONECTATE_PARA_CARGAR_UN_PERIODO_Y_VOLVE_A_PREPARAR_REGISTRO}</FieldDescription> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.periods.length && canCreatePeriods ? <Button asChild variant="outline" size="sm"><Link href="/mercaderia#periodos">{DELIVERY_UI_TEXT.CREAR_UN_PERIODO_EN_MERCADERIA}</Link></Button> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.periods.length && !canCreatePeriods ? <FieldDescription>{APPLICATION_UI_TEXT.PEDILE_A_PRESIDENCIA_O_SECRETARIA_QUE_CARGUE_UN_PERIODO}</FieldDescription> : null}</div> : null}
          </Field>
          {selectedPeriod ? <p className="mt-3 text-xs text-muted-foreground">{DELIVERY_UI_TEXT.VIGENCIA}{selectedPeriod.startsAt.slice(0, 10)} {DELIVERY_UI_TEXT.AL}{selectedPeriod.endsAt.slice(0, 10)}</p> : null}
          {selectedPeriod && !isFamilyPeriod ? <p className="mt-2 text-sm text-muted-foreground">{DELIVERY_UI_TEXT.PERIODO_DE_INSUMOS_MERENDERO}</p> : null}
        </CardContent>
      </Card>

      {selectedPeriod && canReadMerchandise ? <DistributionPreparationPanel data={data} periodId={periodId} userId={userId} sessionExpiresAt={sessionExpiresAt} canWrite={canWrite} isOnline={isOnline} onRefresh={fetchData} /> : null}
      {selectedPeriod?.destination === "FAMILIES" && canReadMerchandise ? <FamilyDeliveryPanel data={data} periodId={periodId} userId={userId} sessionExpiresAt={sessionExpiresAt} canWrite={canWrite} isOnline={isOnline} onRefresh={fetchData} onOfflineDocumentCreated={(document) => setOfflineDocuments((current) => [...current.filter((existing) => existing.id !== document.id), document])} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{DELIVERY_UI_TEXT.REGISTROS_Y_PLANILLAS_EMITIDAS}</CardTitle>
          <CardDescription>{DELIVERY_UI_TEXT.CADA_VERSION_CONSERVA_LOS_NOMBRES_DNI_DOMICILIOS_Y_BARRIOS_INCLUIDOS_AL}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="records-heading">
            <h3 id="records-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold"><HugeiconsIcon icon={PackageIcon} className="text-primary" /> {DELIVERY_UI_TEXT.ENTREGAS_REGISTRADAS}{currentRecords.length + additionalRecordOperations.length}{APPLICATION_UI_TEXT.TEXT_2}</h3>
            {currentRecords.length || additionalRecordOperations.length ? <ul className="flex flex-col divide-y divide-border">{currentRecords.map((record) => <li key={record.id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block truncate">{record.person.firstName} {record.person.lastName}</strong><span className="text-xs text-muted-foreground">{record.family.name} {APPLICATION_UI_TEXT.TEXT}{record.moduleType} {APPLICATION_UI_TEXT.TEXT}{record.quantity} {DELIVERY_UI_TEXT.UNIDAD_ES}</span></span><Badge variant="success">{DELIVERY_UI_TEXT.GUARDADO}</Badge></li>)}{additionalRecordOperations.map(({ operation, payload }) => {
              const person = data.families.flatMap((family) => family.members.map((member) => member.person)).find((entry) => entry.id === payload.personId);
              const family = data.families.find((entry) => entry.id === payload.familyId);
              let badgeLabel: string = DELIVERY_UI_TEXT.PENDIENTE;
              let badgeVariant: "success" | "warning" | "destructive" = "warning";
              let details: string = DELIVERY_UI_TEXT.ESTE_DISPOSITIVO_PENDIENTE_DE_VALIDACION_DEL_SERVIDOR;

              if (operation.status === "synced") {
                badgeLabel = DELIVERY_UI_TEXT.GUARDADO;
                badgeVariant = "success";
                details = DELIVERY_UI_TEXT.DETALLE_REGISTRO(family?.name ?? DELIVERY_UI_TEXT.GRUPO_FAMILIAR, payload.moduleType, payload.quantity);
              } else if (operation.status === "conflict") {
                badgeLabel = DELIVERY_UI_TEXT.CONFLICTO;
                details = operation.message ?? DELIVERY_UI_TEXT.REVISA_LOS_REGISTROS_DEL_PERIODO_ANTES_DE_VOLVER_A_INTENTAR;
              } else if (operation.status === "error") {
                badgeLabel = DELIVERY_UI_TEXT.REQUIERE_ATENCION;
                badgeVariant = "destructive";
                details = operation.message ?? DELIVERY_UI_TEXT.EL_SERVIDOR_NO_CONFIRMO_ESTE_CAMBIO;
              } else if (operation.status === "syncing") {
                badgeLabel = DELIVERY_UI_TEXT.SINCRONIZANDO_STATUS;
              }

              return <li key={operation.operationId} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block truncate">{person ? personLabel(person) : DELIVERY_UI_TEXT.REGISTRO_GUARDADO_EN_ESTE_DISPOSITIVO}</strong><span className="text-xs text-muted-foreground">{details}</span></span><Badge variant={badgeVariant}>{badgeLabel}</Badge></li>;
            })}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{DELIVERY_UI_TEXT.TODAVIA_NO_HAY_REGISTROS_CONFIRMADOS_EN_ESTE_PERIODO}</p>}
          </section>
          <section aria-labelledby="sheets-heading">
            <h3 id="sheets-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold"><HugeiconsIcon icon={File01Icon} className="text-primary" /> {DELIVERY_UI_TEXT.VERSIONES_DE_PLANILLA}</h3>
            {currentSheets.length || offlineDocuments.some((document) => document.documentType?.startsWith("beneficiary-sheet")) ? <ul className="flex flex-col divide-y divide-border">{currentSheets.map((sheet) => <li key={sheet.id} className="flex items-center justify-between gap-3 py-3"><span className="text-sm"><strong>{APPLICATION_UI_TEXT.VERSION}{sheet.version}</strong><span className="block text-xs text-muted-foreground">{DELIVERY_UI_TEXT.EMITIDA}{new Date(sheet.createdAt).toLocaleString("es-AR")}</span></span><Button asChild variant="outline" size="sm" disabled={!isOnline}><a href={API_ROUTES.RECORD_SHEET(sheet.id)}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" /> {DELIVERY_UI_TEXT.DESCARGAR}</a></Button></li>)}{offlineDocuments.filter((document) => document.documentType?.startsWith("beneficiary-sheet")).map((document) => <li key={document.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0 text-sm"><strong className="block truncate">{document.documentType === "beneficiary-sheet-local" ? DELIVERY_UI_TEXT.BORRADOR_LOCAL_SIN_VERSION_OFICIAL : document.originalName}</strong><span className="block truncate text-xs text-muted-foreground">{document.originalName}</span></span><Button variant="outline" size="sm" onClick={() => { const url = URL.createObjectURL(document.content); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = document.originalName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" /> {DELIVERY_UI_TEXT.DESCARGAR}</Button></li>)}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{DELIVERY_UI_TEXT.LAS_PLANILLAS_QUE_EMITAS_APARECERAN_ACA_CON_SU_VERSION}</p>}
          </section>
        </CardContent>
      </Card>

      {isLoading ? <p className="sr-only" role="status">{DELIVERY_UI_TEXT.CARGANDO_DATOS_DEL_PADRON}</p> : null}
    </div>
  );
}
