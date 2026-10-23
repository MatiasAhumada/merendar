"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import type { OfflineOperation } from "@/types/offline-operation";
import { createLocalBeneficiarySheetPdf } from "@/services/local-beneficiary-sheet.service";
import { readOfflinePreparedDocuments, removeOfflinePreparedDocument, saveOfflinePreparedDocument, type OfflinePreparedDocument } from "@/services/offline-preparation.service";
import { beneficiarySheetDraftSchema, distributionRecordPayloadSchema, recordsCollectionSchema, type RecordsCollection } from "@/validations/record.validation";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import type { JsonValue } from "@/types/json-value";

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

export function DeliveryWorkbench({ userId, sessionExpiresAt, canWrite, canCreateFamilies, canCreatePeriods, offlineMode = false, initialOfflineData, preparedDocuments = [] }: DeliveryWorkbenchProps) {
  const isOnline = useNetworkStatus();
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

  const fetchData = useCallback(async (selectedPeriodId?: string) => {
    const query = selectedPeriodId ? `?periodId=${encodeURIComponent(selectedPeriodId)}` : "";
    const response = await fetch(`/api/records${query}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("No pudimos cargar los períodos y el padrón. Conectate para actualizar los datos.");
    }

    const parsedResult = recordsCollectionSchema.safeParse(await response.json());
    if (!parsedResult.success) {
      throw new Error("El servidor devolvió datos de Registro con un formato inesperado.");
    }
    const result = parsedResult.data;
    setData((current) => ({ ...result, records: selectedPeriodId ? result.records : current.records, sheets: selectedPeriodId ? result.sheets : current.sheets }));
    setHasLoadedData(true);
    setLoadFailed(false);

    if (!selectedPeriodId && !periodId && result.periods[0]) {
      setPeriodId(result.periods[0].id);
    }
  }, [periodId]);

  useEffect(() => {
    let cancelled = false;

    if (offlineMode || !isOnline) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setError("");
    setLoadFailed(false);
    fetchData(periodId || undefined)
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setLoadFailed(true);
          setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el registro.");
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
  }, [fetchData, isOnline, offlineMode, periodId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listOfflineOperations(userId), readOfflinePreparedDocuments(userId)]).then(([operations, documents]) => {
      if (!cancelled) {
        setOfflineOperations(operations);
        setOfflineDocuments(documents);
      }
    }).catch(() => {
      if (!cancelled) {
        setError("No se pudieron leer los cambios y documentos guardados en este dispositivo.");
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
  let connectionLabel = "Sin conexión";
  let connectionVariant: "success" | "warning" = "warning";

  if (offlineMode) {
    connectionLabel = "Vista local";
  } else if (isOnline) {
    connectionLabel = "Conectado";
    connectionVariant = "success";
  }
  let periodAvailabilityMessage = "";
  let familyAvailabilityMessage = "";

  if (isLoading) {
    periodAvailabilityMessage = "Cargando períodos…";
    familyAvailabilityMessage = "Cargando grupos familiares…";
  } else if (!isOnline && !hasLoadedData) {
    periodAvailabilityMessage = "No hay períodos preparados en esta vista sin conexión.";
    familyAvailabilityMessage = "No hay grupos familiares preparados en esta vista sin conexión.";
  } else if (loadFailed && !hasLoadedData) {
    periodAvailabilityMessage = "No se pudo confirmar si hay períodos. Reintentá la carga para actualizar la lista.";
    familyAvailabilityMessage = "No se pudo confirmar si hay grupos familiares. Reintentá la carga para actualizar la lista.";
  } else {
    if (!data.periods.length) {
      periodAvailabilityMessage = "No hay períodos cargados.";
    }

    if (!data.families.length) {
      familyAvailabilityMessage = "No hay grupos familiares cargados en el padrón.";
    }
  }

  async function retryData() {
    setIsLoading(true);
    setLoadFailed(false);
    setError("");

    try {
      await fetchData(periodId || undefined);
    } catch (loadError) {
      setLoadFailed(true);
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el registro.");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleBeneficiary(beneficiaryId: string, checked: boolean | "indeterminate") {
    if (checked === "indeterminate") {
      return;
    }

    setSelectedPersonIds((personIds) => checked
      ? [...new Set([...personIds, beneficiaryId])]
      : personIds.filter((id) => id !== beneficiaryId));
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPeriod || !selectedFamily || !personId || !moduleType.trim()) {
      setError("Completá el módulo, el grupo y el beneficiario antes de confirmar.");
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
        setNotice("Registro guardado en el servidor.");
        setFamilyId("");
        setPersonId("");
        setNotes("");
        setPhysicalDniChecked(false);
        setDocumentsChecked(false);
        try {
          await fetchData(periodId);
        } catch {
          setNotice("Registro guardado en el servidor. No se pudo actualizar la lista; reintentá la carga sin volver a confirmar.");
          setLoadFailed(true);
        }
      } else if (offlineMode) {
        setNotice("Registro pendiente. El cambio quedó guardado en este dispositivo y se sincronizará al reconectar.");
        setFamilyId("");
        setPersonId("");
        setNotes("");
        setPhysicalDniChecked(false);
        setDocumentsChecked(false);
      } else if (matchingOperation?.status === "conflict") {
        setError(matchingOperation.message ?? "Este beneficiario ya tiene un registro en el período seleccionado.");
      } else if (matchingOperation?.status === "error") {
        setNotice(`Pendiente de sincronización: ${matchingOperation.message ?? "el borrador sigue guardado en este dispositivo."}`);
      } else {
        setNotice("Pendiente de sincronización. El borrador quedó guardado en este dispositivo.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el registro.");
    } finally {
      setIsSaving(false);
    }
  }

  async function issueSheet() {
    if (!periodId || selectedPersonIds.length === 0) {
      setError("Seleccioná el período y al menos un beneficiario para emitir la planilla.");
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
        })));
      const missingDni = selectedBeneficiaries.filter((beneficiary) => !/^\d{7,8}$/.test(beneficiary.dni));
      if (missingDni.length) {
        setDniRecoveryNeeded(true);
        setError(`No se puede preparar la planilla: falta un DNI válido para ${missingDni.map((beneficiary) => beneficiary.name).join(", ")}. Cargá o corregí el DNI en Familias y volvé a preparar la lista.`);
        return;
      }
      if (offlineMode) {
        const parsedDraft = beneficiarySheetDraftSchema.safeParse({
          kind: "beneficiary-sheet",
          id: crypto.randomUUID(),
          periodId,
          period: { label: selectedPeriod?.label, agency: selectedPeriod?.agency, startsAt: selectedPeriod?.startsAt.slice(0, 10), endsAt: selectedPeriod?.endsAt.slice(0, 10) },
          beneficiaries: selectedBeneficiaries,
        });
        if (!parsedDraft.success) {
          throw new Error("No se pudo preparar una planilla con los datos capturados. Conectate para actualizar el padrón.");
        }
        const pdfBytes = await createLocalBeneficiarySheetPdf(parsedDraft.data);
        const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
        new Uint8Array(pdfBuffer).set(pdfBytes);
        const content = new Blob([pdfBuffer], { type: "application/pdf" });
        const localDocumentId = `local:${parsedDraft.data.id}`;
        const document: OfflinePreparedDocument = {
          id: localDocumentId,
          originalName: `planilla-${periodId}-local-${parsedDraft.data.id.slice(0, 8)}.pdf`,
          contentType: "application/pdf",
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
            payload: parsedDraft.data as JsonValue,
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
        setNotice(`Borrador local ${parsedDraft.data.id.slice(0, 8).toUpperCase()} guardado. El PDF conserva estos beneficiarios; todavía no tiene versión oficial.`);
        setSelectedPersonIds([]);
        return;
      }
      const response = await fetch("/api/records/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId, personIds: selectedPersonIds }),
      });
      const result = await response.json() as { sheet?: { id: string; version: number; periodId: string; createdAt: string }; error?: { message?: string } };

      if (!response.ok || !result.sheet) {
        const responseMessage = result.error?.message ?? "No se pudo emitir la planilla.";
        if (responseMessage.toLocaleLowerCase("es-AR").includes("dni")) {
          setDniRecoveryNeeded(true);
        }
        throw new Error(responseMessage);
      }

      setNotice(`Planilla versión ${result.sheet.version} emitida con ${selectedPersonIds.length} beneficiarios.`);
      setSelectedPersonIds([]);
      try {
        const pdfResponse = await fetch(`/api/records/sheets/${encodeURIComponent(result.sheet.id)}`, { cache: "no-store" });
        if (!pdfResponse.ok) {
          throw new Error("No se pudo descargar el PDF.");
        }
        const pdf = await pdfResponse.blob();
        const url = URL.createObjectURL(pdf);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `planilla-${periodId}-v${result.sheet.version}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setError(`La planilla versión ${result.sheet.version} quedó emitida, pero no se pudo descargar. Reintentá desde Versiones sin volver a emitir.`);
      }
      try {
        await fetchData(periodId);
      } catch {
        setError(`La planilla versión ${result.sheet.version} quedó emitida, pero no se pudo actualizar la lista. Reintentá la carga sin volver a emitir.`);
      }
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "No se pudo emitir la planilla.");
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
      await fetchData(periodId);
      setNotice("Se revisaron los cambios pendientes. Las planillas locales mantienen su contenido y su estado de borrador.");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "No se pudieron sincronizar los cambios pendientes.");
      setOfflineOperations(await listOfflineOperations(userId));
    } finally {
      setIsSynchronizing(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Distribución comunitaria</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Beneficiarios y planillas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Registrá la entrega del módulo y prepará el listado para imprimir y firmar a mano.</p>
        </div>
        <Badge variant={connectionVariant} className="w-fit">{connectionLabel}</Badge>
      </header>

      {error ? <Alert variant="destructive"><AlertTitle>{error.includes("quedó emitida") ? "La planilla fue emitida" : "No se completó la operación"}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}{dniRecoveryNeeded && canCreateFamilies ? <Button asChild variant="outline" size="sm"><Link href="/familias">Corregir en Familias</Link></Button> : null}{dniRecoveryNeeded && !canCreateFamilies ? <span>Pedile a Presidencia o Secretaría que corrija el padrón en Familias.</span> : null}{loadFailed ? <Button variant="outline" size="sm" onClick={() => void retryData()}>Reintentar</Button> : null}</AlertDescription></Alert> : null}
      {notice ? <Alert variant="info"><AlertTitle>Estado del registro</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
      {offlineMode && offlineOperations.some((operation) => operation.status !== "synced") ? <Card><CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm">Hay cambios guardados en este dispositivo. Al recuperar conexión, sincronizalos para validar permisos, duplicados y cupos.</p><Button onClick={() => void synchronizePendingChanges()} disabled={!isOnline || isSynchronizing || !canWrite}>{isSynchronizing ? "Sincronizando…" : "Sincronizar cambios"}</Button></CardContent></Card> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={Calendar03Icon} className="text-primary" /> Módulo o período</CardTitle>
          <CardDescription>Elegí un período activo para consultar beneficiarios, registros y planillas emitidas.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="record-period">Período</FieldLabel>
            <Select value={periodId} onValueChange={(value) => { setPeriodId(value); setSelectedPersonIds([]); }} disabled={isLoading || !data.periods.length}>
              <SelectTrigger id="record-period" aria-label="Seleccionar módulo o período"><SelectValue placeholder="Seleccionar un período" /></SelectTrigger>
              <SelectContent>
                {data.periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.label} · {period.agency}</SelectItem>)}
              </SelectContent>
            </Select>
            {periodAvailabilityMessage ? <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center"><FieldDescription>{periodAvailabilityMessage}</FieldDescription>{offlineMode && !data.periods.length ? <FieldDescription>Conectate para cargar un período y volvé a preparar Registro.</FieldDescription> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.periods.length && canCreatePeriods ? <Button asChild variant="outline" size="sm"><Link href="/mercaderia#periodos">Crear un período en Mercadería</Link></Button> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.periods.length && !canCreatePeriods ? <FieldDescription>Pedile a Presidencia o Secretaría que cargue un período.</FieldDescription> : null}</div> : null}
          </Field>
          {selectedPeriod ? <p className="mt-3 text-xs text-muted-foreground">Vigencia: {selectedPeriod.startsAt.slice(0, 10)} al {selectedPeriod.endsAt.slice(0, 10)}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        {canWrite ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={PackageIcon} className="text-primary" /> Registrar beneficiario</CardTitle>
            <CardDescription>Los cambios se guardan en el servidor o quedan en la cola local hasta recuperar conexión.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={(event) => void saveRecord(event)}>
              <FieldGroup className="gap-4 sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="record-family">Grupo familiar</FieldLabel>
                  <Select value={familyId} onValueChange={(value) => { setFamilyId(value); setPersonId(""); }} disabled={isLoading || !data.families.length}>
                    <SelectTrigger id="record-family"><SelectValue placeholder="Seleccionar grupo" /></SelectTrigger>
                    <SelectContent>{data.families.map((family) => <SelectItem key={family.id} value={family.id}>{family.name} · {family.neighborhood}</SelectItem>)}</SelectContent>
                  </Select>
                  {familyAvailabilityMessage ? <div className="mt-2 flex flex-col items-start gap-2"><FieldDescription>{familyAvailabilityMessage}</FieldDescription>{offlineMode && !data.families.length ? <FieldDescription>Conectate para cargar un grupo familiar y volvé a preparar Registro.</FieldDescription> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.families.length && canCreateFamilies ? <Button asChild variant="outline" size="sm"><Link href="/familias">Cargar grupo familiar</Link></Button> : null}{!isLoading && !loadFailed && isOnline && !offlineMode && !data.families.length && !canCreateFamilies ? <FieldDescription>Pedile a Presidencia o Secretaría que cargue un grupo familiar.</FieldDescription> : null}</div> : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-person">Beneficiario</FieldLabel>
                  <Select value={personId} onValueChange={setPersonId} disabled={!familyId}>
                    <SelectTrigger id="record-person"><SelectValue placeholder="Seleccionar persona" /></SelectTrigger>
                    <SelectContent>{familyMembers.map((member) => <SelectItem key={member.person.id} value={member.person.id}>{personLabel(member.person)}{member.person.dni ? ` · DNI ${member.person.dni}` : " · Falta DNI"}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-type">Tipo de módulo</FieldLabel>
                  <Input id="record-type" value={moduleType} onChange={(event) => setModuleType(event.target.value)} maxLength={100} required placeholder="Ej.: módulo familiar seco" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-quantity">Cantidad</FieldLabel>
                  <Input id="record-quantity" type="number" min="1" max="1000" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="record-date">Fecha de entrega</FieldLabel>
                  <Input id="record-date" type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required />
                </Field>
              </FieldGroup>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm">
                  <Checkbox checked={physicalDniChecked} onCheckedChange={(checked) => { if (checked === "indeterminate") return; setPhysicalDniChecked(checked); }} aria-label="DNI físico cotejado" />
                  <span>DNI físico cotejado</span>
                </label>
                <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/60 p-3 text-sm">
                  <Checkbox checked={documentsChecked} onCheckedChange={(checked) => { if (checked === "indeterminate") return; setDocumentsChecked(checked); }} aria-label="Documentación comprobada" />
                  <span>Documentación comprobada</span>
                </label>
              </div>

              <Field><FieldLabel htmlFor="record-notes">Observaciones</FieldLabel><Textarea id="record-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} /></Field>
              <Button type="submit" className="w-full sm:w-auto" disabled={!periodId || isSaving || isLoading}>
                {isSaving ? "Guardando…" : "Confirmar registro"}
              </Button>
            </form>
          </CardContent>
        </Card> : null}

        {canWrite ? <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HugeiconsIcon icon={UserGroupIcon} className="text-primary" /> Planilla para firma en papel</CardTitle>
            <CardDescription>Seleccioná personas del padrón. La descarga no depende de confirmar sus entregas ni completar una rendición.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
              {data.families.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No hay grupos cargados en el padrón.</p> : data.families.map((family) => (
                <section key={family.id} className="border-b border-border last:border-b-0">
                  <h3 className="bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide">{family.name} · {family.neighborhood}</h3>
                  {family.members.map((member) => {
                    const person = member.person;
                    const checked = selectedPersonIds.includes(person.id);
                    const alreadyRecorded = recordedPeople.has(person.id);

                    return (
                      <label key={person.id} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleBeneficiary(person.id, value)} aria-label={`Incluir a ${personLabel(person)} en la planilla`} />
                        <span className="min-w-0 flex-1"><strong className="block truncate">{personLabel(person)}</strong><span className="text-xs text-muted-foreground">DNI {person.dni ?? "pendiente"} · {family.address}</span></span>
                        {alreadyRecorded ? <Badge variant="secondary">Registrado</Badge> : null}
                      </label>
                    );
                  })}
                </section>
              ))}
            </div>
            <Button onClick={() => void issueSheet()} disabled={(!isOnline && !offlineMode) || !periodId || selectedPersonIds.length === 0 || isIssuingSheet}>
              <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
              {isIssuingSheet ? "Preparando planilla…" : `Descargar PDF${selectedPersonIds.length ? ` · ${selectedPersonIds.length}` : ""}`}
            </Button>
            {offlineMode ? <p className="text-xs text-muted-foreground">El PDF creado sin conexión es un borrador local sin versión oficial. El servidor validará el período, permisos y cupos al sincronizar.</p> : null}
            {!isOnline && !offlineMode ? <p className="text-xs text-muted-foreground">Abrí Registro desde Acceso sin conexión para usar el padrón preparado y guardar cambios locales.</p> : null}
          </CardContent>
        </Card> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registros y planillas emitidas</CardTitle>
          <CardDescription>La versión conserva los nombres, DNI y domicilios exactos incluidos al emitir cada PDF.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="records-heading">
            <h3 id="records-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold"><HugeiconsIcon icon={PackageIcon} className="text-primary" /> Entregas registradas ({currentRecords.length + additionalRecordOperations.length})</h3>
            {currentRecords.length || additionalRecordOperations.length ? <ul className="flex flex-col divide-y divide-border">{currentRecords.map((record) => <li key={record.id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block truncate">{record.person.firstName} {record.person.lastName}</strong><span className="text-xs text-muted-foreground">{record.family.name} · {record.moduleType} · {record.quantity} unidad(es)</span></span><Badge variant="success">Guardado</Badge></li>)}{additionalRecordOperations.map(({ operation, payload }) => {
              const person = data.families.flatMap((family) => family.members.map((member) => member.person)).find((entry) => entry.id === payload.personId);
              const family = data.families.find((entry) => entry.id === payload.familyId);
              let badgeLabel = "Pendiente";
              let badgeVariant: "success" | "warning" | "destructive" = "warning";
              let details = "Este dispositivo · pendiente de validación del servidor";

              if (operation.status === "synced") {
                badgeLabel = "Guardado";
                badgeVariant = "success";
                details = `${family?.name ?? "Grupo familiar"} · ${payload.moduleType} · ${payload.quantity} unidad(es)`;
              } else if (operation.status === "conflict") {
                badgeLabel = "Conflicto";
                details = operation.message ?? "Revisá los registros del período antes de volver a intentar.";
              } else if (operation.status === "error") {
                badgeLabel = "Requiere atención";
                badgeVariant = "destructive";
                details = operation.message ?? "El servidor no confirmó este cambio.";
              } else if (operation.status === "syncing") {
                badgeLabel = "Sincronizando";
              }

              return <li key={operation.operationId} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0"><strong className="block truncate">{person ? personLabel(person) : "Registro guardado en este dispositivo"}</strong><span className="text-xs text-muted-foreground">{details}</span></span><Badge variant={badgeVariant}>{badgeLabel}</Badge></li>;
            })}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Todavía no hay registros confirmados en este período.</p>}
          </section>
          <section aria-labelledby="sheets-heading">
            <h3 id="sheets-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold"><HugeiconsIcon icon={File01Icon} className="text-primary" /> Versiones de planilla</h3>
            {currentSheets.length || offlineDocuments.some((document) => document.documentType?.startsWith("beneficiary-sheet")) ? <ul className="flex flex-col divide-y divide-border">{currentSheets.map((sheet) => <li key={sheet.id} className="flex items-center justify-between gap-3 py-3"><span className="text-sm"><strong>Versión {sheet.version}</strong><span className="block text-xs text-muted-foreground">Emitida {new Date(sheet.createdAt).toLocaleString("es-AR")}</span></span><Button asChild variant="outline" size="sm" disabled={!isOnline}><a href={`/api/records/sheets/${encodeURIComponent(sheet.id)}`}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" /> Descargar</a></Button></li>)}{offlineDocuments.filter((document) => document.documentType?.startsWith("beneficiary-sheet")).map((document) => <li key={document.id} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0 text-sm"><strong className="block truncate">{document.documentType === "beneficiary-sheet-local" ? "Borrador local · sin versión oficial" : document.originalName}</strong><span className="block truncate text-xs text-muted-foreground">{document.originalName}</span></span><Button variant="outline" size="sm" onClick={() => { const url = URL.createObjectURL(document.content); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = document.originalName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }}><HugeiconsIcon icon={Download04Icon} data-icon="inline-start" /> Descargar</Button></li>)}</ul> : <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Las planillas que emitas aparecerán acá con su versión.</p>}
          </section>
        </CardContent>
      </Card>

      {isLoading ? <p className="sr-only" role="status">Cargando datos del padrón</p> : null}
    </div>
  );
}
