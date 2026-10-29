"use client";

import { HTTP_CONTENT_TYPES, HTTP_RESPONSE_TYPES, NO_STORE_REQUEST_HEADERS } from "@/constants/http.constant";
import { DELIVERY_ERROR_MESSAGES, DELIVERY_UI_TEXT, DELIVERY_SHEET_COLUMNS } from "@/constants/delivery.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { API_ROUTES, ROUTES } from "@/constants/routes.constant";
import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon, Download04Icon, File01Icon, PackageIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { enqueueOfflineOperation, listOfflineOperations, synchronizeOfflineQueue } from "@/services/offline-queue.service";
import { createLocalBeneficiarySheetPdf } from "@/services/local-beneficiary-sheet.service";
import { readOfflinePreparedDocuments, removeOfflinePreparedDocument, saveOfflinePreparedDocument, type OfflinePreparedDocument } from "@/services/offline-preparation.service";
import { beneficiarySheetDraftSchema, beneficiarySheetResponseSchema, distributionRecordPayloadSchema } from "@/schemas/record.schema";
import type { RecordsCollection } from "@/types/schema-contracts";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { BRAND } from "@/constants/brand.constant";
import { getDeliveryCollection } from "@/services/client/delivery-data.service";
import Link from "next/link";
import clientAxios from "@/utils/clientAxios.util";
import { getClientErrorMessage } from "@/utils/handlers/clientHandler";

import type { OfflineOperation } from "@/types/offline-operation";

import type { JsonValue } from "@/types/json-value";
import { jsonValueSchema } from "@/schemas/offline.schema";

type WorkbenchData = RecordsCollection;

interface DeliveryWorkbenchProps {
  userId: string;
  sessionExpiresAt: string;
  canWrite: boolean;
  canCreateFamilies: boolean;
  canCreatePeriods: boolean;
  offlineMode?: boolean;
  initialOfflineData?: WorkbenchData;
  preparedDocuments?: OfflinePreparedDocument[];
}

const emptyData: WorkbenchData = { periods: [], families: [], records: [], sheets: [] };

function localDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function personLabel(person: WorkbenchData["families"][number]["members"][number]["person"]) {
  return `${person.firstName} ${person.lastName}`;
}

export function DeliveryWorkbench({ userId, sessionExpiresAt, canWrite, canCreateFamilies, canCreatePeriods, initialOfflineData, preparedDocuments = [] }: DeliveryWorkbenchProps) {
  const isOnline = useNetworkStatus();
  const offlineMode = !isOnline;
  const [data, setData] = useState<WorkbenchData>(initialOfflineData ?? emptyData);
  const [periodId, setPeriodId] = useState(initialOfflineData?.periods[0]?.id ?? "");
  const [familyId, setFamilyId] = useState("");
  const [personId, setPersonId] = useState("");
  const [moduleType, setModuleType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [receivedAt, setReceivedAt] = useState(localDate());
  const [physicalDniChecked, setPhysicalDniChecked] = useState(false);
  const [documentsChecked, setDocumentsChecked] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(!offlineMode);
  const [hasLoadedData, setHasLoadedData] = useState(Boolean(initialOfflineData));
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isIssuingSheet, setIsIssuingSheet] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [dniRecoveryNeeded, setDniRecoveryNeeded] = useState(false);
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
  const selectedFamily = data.families.find((family) => family.id === familyId);
  const familyMembers = selectedFamily?.members ?? [];
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
  const recordedPeople = new Set([...currentRecords.map((record) => record.personId), ...queuedRecordOperations.map(({ payload }) => payload.personId)]);
  let connectionLabel: string = DELIVERY_UI_TEXT.SIN_CONEXION;
  let connectionVariant: "success" | "warning" = "warning";

  if (offlineMode) {
    connectionLabel = "Vista local";
  } else if (isOnline) {
    connectionLabel = DELIVERY_UI_TEXT.CONECTADO;
    connectionVariant = "success";
  }
  let periodAvailabilityMessage = "";
  let familyAvailabilityMessage = "";

  if (isLoading) {
    periodAvailabilityMessage = "Cargando períodos…";
    familyAvailabilityMessage = DELIVERY_UI_TEXT.CARGANDO_GRUPOS_FAMILIARES;
  } else if (!isOnline && !hasLoadedData) {
    periodAvailabilityMessage = DELIVERY_UI_TEXT.NO_HAY_PERIODOS_PREPARADOS_EN_ESTA_VISTA_SIN_CONEXION;
    familyAvailabilityMessage = DELIVERY_UI_TEXT.NO_HAY_GRUPOS_FAMILIARES_PREPARADOS_EN_ESTA_VISTA_SIN_CONEXION;
  } else if (loadFailed && !hasLoadedData) {
    periodAvailabilityMessage = DELIVERY_UI_TEXT.NO_SE_PUDO_CONFIRMAR_SI_HAY_PERIODOS_REINTENTA_LA_CARGA_PARA_ACTUALIZAR_LA;
    familyAvailabilityMessage = DELIVERY_UI_TEXT.NO_SE_PUDO_CONFIRMAR_SI_HAY_GRUPOS_FAMILIARES_REINTENTA_LA_CARGA_PARA_ACTU;
  } else {
    if (!data.periods.length) {
      periodAvailabilityMessage = DELIVERY_UI_TEXT.NO_HAY_PERIODOS_CARGADOS;
    }

    if (!data.families.length) {
      familyAvailabilityMessage = DELIVERY_UI_TEXT.NO_HAY_GRUPOS_FAMILIARES_CARGADOS_EN_EL_PADRON;
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

  function toggleBeneficiary(beneficiaryId: string, checked: boolean | "indeterminate") {
    if (checked === "indeterminate") {
      return;
    }

    setSelectedPersonIds((personIds) => {
      if (checked) {
        return [...new Set([...personIds, beneficiaryId])];
      }

      return personIds.filter((id) => id !== beneficiaryId);
    });
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPeriod || !selectedFamily || !personId || !moduleType.trim()) {
      setError(DELIVERY_ERROR_MESSAGES.COMPLETA_EL_MODULO_EL_GRUPO_Y_EL_BENEFICIARIO_ANTES_DE_CONFIRMAR);
      return;
    }

    setIsSaving(true);
    setNotice("");
    setError("");
    const recordId = crypto.randomUUID();
    const payload: JsonValue = {
      kind: "distribution-record",
      id: recordId,
      periodId,
      familyId,
      personId,
      receivedAt,
      moduleType: moduleType.trim(),
      quantity: Number(quantity),
      physicalDniChecked,
      documentsChecked,
      notes: notes.trim(),
    };

    try {
      await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "records",
        resourceId: recordId,
        operation: "create",
        baseVersion: null,
        dependencies: [],
        payload,
      });

      if (isOnline && !offlineMode) {
        await synchronizeOfflineQueue(userId);
      }

      const operations = await listOfflineOperations(userId);
      const matchingOperation = operations.find((operation) => operation.resourceId === recordId);

      if (offlineMode || matchingOperation?.status !== "synced") {
        setOfflineOperations(operations);
      }

      if (matchingOperation?.status === "synced") {
        setNotice(DELIVERY_UI_TEXT.REGISTRO_GUARDADO_EN_EL_SERVIDOR);
        setFamilyId("");
        setPersonId("");
        setNotes("");
        setPhysicalDniChecked(false);
        setDocumentsChecked(false);
        try {
          await fetchData();
        } catch {
          setNotice(DELIVERY_UI_TEXT.REGISTRO_GUARDADO_EN_EL_SERVIDOR_NO_SE_PUDO_ACTUALIZAR_LA_LISTA_REINTENTA_);
          setLoadFailed(true);
        }
      } else if (offlineMode) {
        setNotice(DELIVERY_UI_TEXT.REGISTRO_PENDIENTE_EL_CAMBIO_QUEDO_GUARDADO_EN_ESTE_DISPOSITIVO_Y_SE_SINCR);
        setFamilyId("");
        setPersonId("");
        setNotes("");
        setPhysicalDniChecked(false);
        setDocumentsChecked(false);
      } else if (matchingOperation?.status === "conflict") {
        setError(matchingOperation.message ?? DELIVERY_ERROR_MESSAGES.ESTE_BENEFICIARIO_YA_TIENE_UN_REGISTRO_EN_EL_PERIODO_SELECCIONADO);
      } else if (matchingOperation?.status === "error") {
        setNotice(DELIVERY_UI_TEXT.PENDIENTE_DE_SINCRONIZACION(matchingOperation.message ?? DELIVERY_UI_TEXT.BORRADOR_PENDIENTE_LOCAL));
      } else {
        setNotice(DELIVERY_UI_TEXT.PENDIENTE_DE_SINCRONIZACION_EL_BORRADOR_QUEDO_GUARDADO_EN_ESTE_DISPOSITIVO);
      }
    } catch (saveError) {
      if (saveError instanceof Error) {
        setError(saveError.message);
      } else {
        setError(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_GUARDAR_EL_REGISTRO);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function issueSheet() {
    if (!periodId || selectedPersonIds.length === 0) {
      setError(DELIVERY_ERROR_MESSAGES.SELECCIONA_EL_PERIODO_Y_AL_MENOS_UN_BENEFICIARIO_PARA_EMITIR_LA_PLANILLA);
      return;
    }

    setIsIssuingSheet(true);
    setError("");
    setDniRecoveryNeeded(false);
    setNotice("");

    try {
      const selectedBeneficiaries = data.families.flatMap((family) => family.members
        .filter((member) => selectedPersonIds.includes(member.person.id))
        .map((member) => ({
          personId: member.person.id,
          name: personLabel(member.person),
          dni: member.person.dni ?? "",
          familyName: family.name,
          address: family.address,
          neighborhood: family.neighborhood,
        })));
      const missingDni = selectedBeneficiaries.filter((beneficiary) => !/^\d{7,8}$/.test(beneficiary.dni));
      if (missingDni.length) {
        setDniRecoveryNeeded(true);
        setError(DELIVERY_UI_TEXT.PLANILLA_SIN_DNI(missingDni.map((beneficiary) => beneficiary.name)));
        return;
      }
      if (offlineMode) {
        const parsedDraft = beneficiarySheetDraftSchema.safeParse({
          kind: "beneficiary-sheet",
          id: crypto.randomUUID(),
          periodId,
          period: { label: selectedPeriod?.label, agency: selectedPeriod?.agency, startsAt: selectedPeriod?.startsAt.slice(0, 10), endsAt: selectedPeriod?.endsAt.slice(0, 10) },
          templateVersion: 2,
          beneficiaries: selectedBeneficiaries,
        });
        if (!parsedDraft.success) {
          throw new Error(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_PREPARAR_UNA_PLANILLA_CON_LOS_DATOS_CAPTURADOS_CONECTATE_PA);
        }
        const logoResponse = await clientAxios.get<ArrayBuffer>(BRAND.institutionLogoPath, { responseType: HTTP_RESPONSE_TYPES.ARRAY_BUFFER });
        const pdfBytes = await createLocalBeneficiarySheetPdf(parsedDraft.data, new Uint8Array(logoResponse.data));
        const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
        new Uint8Array(pdfBuffer).set(pdfBytes);
        const content = new Blob([pdfBuffer], { type: HTTP_CONTENT_TYPES.PDF });
        const localDocumentId = `local:${parsedDraft.data.id}`;
        const document: OfflinePreparedDocument = {
          id: localDocumentId,
          originalName: `planilla-${periodId}-local-${parsedDraft.data.id.slice(0, 8)}.pdf`,
          contentType: HTTP_CONTENT_TYPES.PDF,
          byteSize: content.size,
          content,
          documentType: "beneficiary-sheet-local",
        };
        await saveOfflinePreparedDocument(userId, document);
        try {
          await enqueueOfflineOperation(userId, sessionExpiresAt, {
            resource: "records",
            resourceId: parsedDraft.data.id,
            operation: "create",
            baseVersion: null,
            dependencies: [],
            payload: jsonValueSchema.parse(parsedDraft.data),
          });
        } catch (queueError) {
          await removeOfflinePreparedDocument(userId, localDocumentId);
          throw queueError;
        }
        setOfflineDocuments((current) => [...current.filter((entry) => entry.id !== document.id), document]);
        const downloadUrl = URL.createObjectURL(content);
        const downloadAnchor = window.document.createElement("a");
        downloadAnchor.href = downloadUrl;
        downloadAnchor.download = document.originalName;
        downloadAnchor.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        setOfflineOperations(await listOfflineOperations(userId));
        setNotice(DELIVERY_UI_TEXT.BORRADOR_LOCAL_GUARDADO(parsedDraft.data.id.slice(0, 8).toUpperCase()));
        setSelectedPersonIds([]);
        return;
      }
      const response = await clientAxios.post<unknown>(API_ROUTES.RECORD_SHEETS, { periodId, personIds: selectedPersonIds });
      const parsedResponse = beneficiarySheetResponseSchema.safeParse(response.data);

      if (!parsedResponse.success) {
        throw new Error(DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_EMITIR_LA_PLANILLA);
      }

      const { sheet } = parsedResponse.data;

      setNotice(DELIVERY_UI_TEXT.PLANILLA_EMITIDA(sheet.version, selectedPersonIds.length));
      setSelectedPersonIds([]);
      try {
        const pdfResponse = await clientAxios.get<Blob>(API_ROUTES.RECORD_SHEET(sheet.id), {
          responseType: HTTP_RESPONSE_TYPES.BLOB,
          headers: NO_STORE_REQUEST_HEADERS,
        });
        const pdf = pdfResponse.data;
        const url = URL.createObjectURL(pdf);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `planilla-${periodId}-v${sheet.version}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setError(DELIVERY_UI_TEXT.PLANILLA_EMITIDA_NO_DESCARGADA(sheet.version));
      }
      try {
        await fetchData();
      } catch {
        setError(DELIVERY_UI_TEXT.PLANILLA_EMITIDA_LISTA_DESACTUALIZADA(sheet.version));
      }
    } catch (issueError) {
      const issueMessage = getClientErrorMessage(issueError, DELIVERY_ERROR_MESSAGES.NO_SE_PUDO_EMITIR_LA_PLANILLA_CON_PUNTO);

      if (issueMessage.toLocaleLowerCase("es-AR").includes("dni")) {
        setDniRecoveryNeeded(true);
      }

      setError(issueMessage);
    } finally {
      setIsIssuingSheet(false);
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

      {error ? <Alert variant="destructive"><AlertTitle>{error.includes("quedó emitida") ? DELIVERY_UI_TEXT.LA_PLANILLA_FUE_EMITIDA : DELIVERY_UI_TEXT.NO_SE_COMPLETO_LA_OPERACION}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}{dniRecoveryNeeded && canCreateFamilies ? <Button asChild variant="outline" size="sm"><Link href={ROUTES.FAMILIES}>{DELIVERY_UI_TEXT.CORREGIR_EN_FAMILIAS}</Link></Button> : null}{dniRecoveryNeeded && !canCreateFamilies ? <span>{DELIVERY_UI_TEXT.PEDILE_A_PRESIDENCIA_O_SECRETARIA_QUE_CORRIJA_EL_PADRON_EN_FAMILIAS}</span> : null}{loadFailed ? <Button variant="outline" size="sm" onClick={() => void retryData()}>{APPLICATION_UI_TEXT.REINTENTAR}</Button> : null}</AlertDescription></Alert> : null}
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
            <Select value={periodId} onValueChange={(value) => { setPeriodId(value); setSelectedPersonIds([]); }} disabled={isLoading || !data.periods.length}>
              <SelectTrigger id="record-period" aria-label={DELIVERY_UI_TEXT.SELECCIONAR_MODULO_O_PERIODO}><SelectValue placeholder={DELIVERY_UI_TEXT.SELECCIONAR_UN_PERIODO} /></SelectTrigger>
              <SelectContent>
                {data.periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.label} {APPLICATION_UI_TEXT.TEXT}{period.agency}</SelectItem>)}
              </SelectContent>
            </Select>
            {periodAvailabilityMessage ? <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center"><FieldDescription>{periodAvailabilityMessage}</FieldDescription>{offlineMode && !data.periods.length ? <FieldDescription>{DELIVERY_UI_TEXT.CONECTATE_PARA_CARGAR_UN_PERIODO_Y_VOLVE_A_PREPARAR_REGISTRO}</FieldDescription> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.periods.length && canCreatePeriods ? <Button asChild variant="outline" size="sm"><Link href="/mercaderia#periodos">{DELIVERY_UI_TEXT.CREAR_UN_PERIODO_EN_MERCADERIA}</Link></Button> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.periods.length && !canCreatePeriods ? <FieldDescription>{APPLICATION_UI_TEXT.PEDILE_A_PRESIDENCIA_O_SECRETARIA_QUE_CARGUE_UN_PERIODO}</FieldDescription> : null}</div> : null}
          </Field>
          {selectedPeriod ? <p className="mt-3 text-xs text-muted-foreground">{DELIVERY_UI_TEXT.VIGENCIA}{selectedPeriod.startsAt.slice(0, 10)} {DELIVERY_UI_TEXT.AL}{selectedPeriod.endsAt.slice(0, 10)}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {canWrite ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={PackageIcon} className="text-primary" /> {DELIVERY_UI_TEXT.REGISTRAR_BENEFICIARIO}</CardTitle>
            <CardDescription>{DELIVERY_UI_TEXT.LOS_CAMBIOS_SE_GUARDAN_EN_EL_SERVIDOR_O_QUEDAN_EN_LA_COLA_LOCAL_HASTA_RE}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => void saveRecord(event)}>
              <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="record-family">{DELIVERY_UI_TEXT.GRUPO_FAMILIAR}</FieldLabel>
                  <Select value={familyId} onValueChange={(value) => { setFamilyId(value); setPersonId(""); }} disabled={isLoading || !data.families.length}>
                    <SelectTrigger id="record-family"><SelectValue placeholder={DELIVERY_UI_TEXT.SELECCIONAR_GRUPO} /></SelectTrigger>
                    <SelectContent>{data.families.map((family) => <SelectItem key={family.id} value={family.id}>{family.name} {APPLICATION_UI_TEXT.TEXT}{family.neighborhood}</SelectItem>)}</SelectContent>
                  </Select>
                  {familyAvailabilityMessage ? <div className="mt-2 flex flex-col items-start gap-2"><FieldDescription>{familyAvailabilityMessage}</FieldDescription>{offlineMode && !data.families.length ? <FieldDescription>{DELIVERY_UI_TEXT.CONECTATE_PARA_CARGAR_UN_GRUPO_FAMILIAR_Y_VOLVE_A_PREPARAR_REGISTRO}</FieldDescription> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.families.length && canCreateFamilies ? <Button asChild variant="outline" size="sm"><Link href={ROUTES.FAMILIES}>{DELIVERY_UI_TEXT.CARGAR_GRUPO_FAMILIAR}</Link></Button> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.families.length && !canCreateFamilies ? <FieldDescription>{DELIVERY_UI_TEXT.PEDILE_A_PRESIDENCIA_O_SECRETARIA_QUE_CARGUE_UN_GRUPO_FAMILIAR}</FieldDescription> : null}</div> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-person">{DELIVERY_UI_TEXT.BENEFICIARIO}</FieldLabel>
                  <Select value={personId} onValueChange={setPersonId} disabled={!familyId}>
                    <SelectTrigger id="record-person"><SelectValue placeholder={DELIVERY_UI_TEXT.SELECCIONAR_PERSONA} /></SelectTrigger>
                    <SelectContent>{familyMembers.map((member) => <SelectItem key={member.person.id} value={member.person.id}>{personLabel(member.person)}{member.person.dni ? DELIVERY_UI_TEXT.PERSON_DNI(member.person.dni) : DELIVERY_UI_TEXT.FALTA_DNI}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-type">{DELIVERY_UI_TEXT.TIPO_DE_MODULO}</FieldLabel>
                  <Input id="record-type" value={moduleType} onChange={(event) => setModuleType(event.target.value)} maxLength={100} required placeholder={DELIVERY_UI_TEXT.EJ_MODULO_FAMILIAR_SECO} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-quantity">{DELIVERY_UI_TEXT.CANTIDAD}</FieldLabel>
                  <Input id="record-quantity" type="number" min="1" max="1000" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-date">{DELIVERY_SHEET_COLUMNS.DELIVERY_DATE}</FieldLabel>
                  <Input id="record-date" type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required />
                </Field>
              </FieldGroup>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm">
                  <Checkbox checked={physicalDniChecked} onCheckedChange={(checked) => { if (checked === "indeterminate") return; setPhysicalDniChecked(checked); }} aria-label={DELIVERY_UI_TEXT.DNI_FISICO_COTEJADO} />
                  <span>{DELIVERY_UI_TEXT.DNI_FISICO_COTEJADO}</span>
                </label>
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm">
                  <Checkbox checked={documentsChecked} onCheckedChange={(checked) => { if (checked === "indeterminate") return; setDocumentsChecked(checked); }} aria-label={DELIVERY_UI_TEXT.DOCUMENTACION_COMPROBADA} />
                  <span>{DELIVERY_UI_TEXT.DOCUMENTACION_COMPROBADA}</span>
                </label>
              </div>

              <Field><FieldLabel htmlFor="record-notes">{APPLICATION_UI_TEXT.OBSERVACIONES}</FieldLabel><Textarea id="record-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} /></Field>
              <Button type="submit" className="w-full sm:w-auto" disabled={!periodId || isSaving || isLoading}>
                {isSaving ? DELIVERY_UI_TEXT.GUARDANDO : DELIVERY_UI_TEXT.CONFIRMAR_REGISTRO}
              </Button>
            </form>
          </CardContent>
        </Card> : null}

        {canWrite ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={UserGroupIcon} className="text-primary" /> {DELIVERY_UI_TEXT.PLANILLA_PARA_FIRMA_EN_PAPEL}</CardTitle>
            <CardDescription>{DELIVERY_UI_TEXT.SELECCIONA_PERSONAS_DEL_PADRON_LA_DESCARGA_NO_DEPENDE_DE_CONFIRMAR_SUS_E}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
              {data.families.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{DELIVERY_UI_TEXT.NO_HAY_GRUPOS_CARGADOS_EN_EL_PADRON}</p> : data.families.map((family) => (
                <section key={family.id} className="border-b border-border last:border-b-0">
                  <h3 className="bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide">{family.name} {APPLICATION_UI_TEXT.TEXT}{family.neighborhood}</h3>
                  {family.members.map((member) => {
                    const person = member.person;
                    const checked = selectedPersonIds.includes(person.id);
                    const alreadyRecorded = recordedPeople.has(person.id);

                    return (
                      <label key={person.id} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleBeneficiary(person.id, value)} aria-label={DELIVERY_UI_TEXT.BENEFICIARY_ACCESSIBLE_LABEL(personLabel(person))} />
                        <span className="min-w-0 flex-1"><strong className="block truncate">{personLabel(person)}</strong><span className="text-xs text-muted-foreground">{DELIVERY_UI_TEXT.DNI}{person.dni ?? "pendiente"} {APPLICATION_UI_TEXT.TEXT}{family.address}</span></span>
                        {alreadyRecorded ? <Badge variant="secondary">{DELIVERY_UI_TEXT.REGISTRADO}</Badge> : null}
                      </label>
                    );
                  })}
                </section>
              ))}
            </div>
            <Button onClick={() => void issueSheet()} disabled={(!isOnline && !offlineMode) || !periodId || selectedPersonIds.length === 0 || isIssuingSheet}>
              <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
              {isIssuingSheet ? DELIVERY_UI_TEXT.PREPARANDO_PLANILLA : DELIVERY_UI_TEXT.DOWNLOAD_PDF(selectedPersonIds.length)}
            </Button>
            {offlineMode ? <p className="text-xs text-muted-foreground">{DELIVERY_UI_TEXT.EL_PDF_CREADO_SIN_CONEXION_ES_UN_BORRADOR_LOCAL_SIN_VERSION_OFICIAL_EL_S}</p> : null}
            {!isOnline && !offlineMode ? <p className="text-xs text-muted-foreground">{DELIVERY_UI_TEXT.ABRI_REGISTRO_DESDE_ACCESO_SIN_CONEXION_PARA_USAR_EL_PADRON_PREPARADO_Y}</p> : null}
          </CardContent>
        </Card> : null}
      </div>

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
