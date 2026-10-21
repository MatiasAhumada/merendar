"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AddCircleIcon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  File01Icon,
  FileSpreadsheetIcon,
  PackageIcon,
  ReceiptTextIcon,
  RefreshIcon,
  TruckIcon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { enqueueOfflineOperation, listOfflineOperations, synchronizeOfflineQueue, updateOfflineOperationPayload } from "@/services/offline-queue.service";
import type { OfflineOperation } from "@/types/offline-operation";
import type {
  MerchandisePeriodRecord,
  MerchandiseQuotaRecord,
  MerchandiseRemittanceRecord,
  MerchandiseRequestRecord,
} from "@/interfaces/merchandise.interface";
import { merchandisePayloadSchema, type MerchandisePayload } from "@/validations/merchandise.validation";
import { z } from "zod";

interface MerchandiseWorkspaceProps {
  userId: string;
  sessionExpiresAt: string;
}

interface PendingRecord {
  operation: OfflineOperation;
  payload: MerchandisePayload;
}

const merchandiseResponseSchema = z.object({
  periods: z.array(z.object({
    id: z.string(),
    label: z.string(),
    agency: z.string(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    requests: z.array(z.object({
      id: z.string(),
      periodId: z.string(),
      requestNumber: z.string(),
      requestedAt: z.iso.datetime(),
      requestedQuantity: z.number(),
      status: z.enum(["PENDIENTE", "APROBADA", "RECHAZADA"]),
      notes: z.string().nullable(),
      createdBy: z.object({ id: z.string(), name: z.string() }),
      quota: z.object({
        id: z.string(),
        requestId: z.string(),
        approvedQuantity: z.number(),
        approvedAt: z.iso.datetime(),
        notes: z.string().nullable(),
        approvedBy: z.object({ id: z.string(), name: z.string() }),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      }).nullable(),
      remittances: z.array(z.object({
        id: z.string(),
        requestId: z.string(),
        quotaId: z.string(),
        remittanceNumber: z.string(),
        receivedAt: z.iso.datetime(),
        receivedQuantity: z.number(),
        responsibleName: z.string(),
        notes: z.string().nullable(),
        createdBy: z.object({ id: z.string(), name: z.string() }),
        documents: z.array(z.object({
          id: z.string(),
          originalName: z.string(),
          contentType: z.string(),
          byteSize: z.number(),
          createdAt: z.iso.datetime(),
        })),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      })),
      documents: z.array(z.object({
        id: z.string(),
        originalName: z.string(),
        contentType: z.string(),
        byteSize: z.number(),
        createdAt: z.iso.datetime(),
      })),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    })),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })),
});

const renditionChecks = [
  { label: "Remito original digitalizado", status: "Pendiente" },
  { label: "Cupo ministerial cotejado", status: "Pendiente" },
  { label: "Documentación de recepción", status: "Pendiente" },
  { label: "Planilla oficial del período", status: "Pendiente" },
] as const;

const receiptLimitConflictSchema = z.object({
  kind: z.literal("receipt_exceeds_quota"),
  approvedQuantity: z.number().int(),
  receivedSoFar: z.number().int(),
  attemptedQuantity: z.number().int(),
});

const duplicateRemittanceConflictSchema = z.object({
  kind: z.literal("remittance_number_exists"),
  remittanceNumber: z.string(),
});

function formatDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

function formatFileSize(byteSize: number) {
  return `${Math.max(1, Math.round(byteSize / 1024))} KiB`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo guardar el cambio.";
}

async function encodeDocument(file: File | undefined) {
  if (!file) {
    return undefined;
  }

  let contentType: "application/pdf" | "image/jpeg" | "image/png";

  if (file.type === "application/pdf") {
    contentType = "application/pdf";
  } else if (file.type === "image/jpeg") {
    contentType = "image/jpeg";
  } else if (file.type === "image/png") {
    contentType = "image/png";
  } else {
    throw new Error("Adjuntá un comprobante PDF, JPEG o PNG.");
  }

  if (!file.size || file.size > 512 * 1024) {
    throw new Error("El comprobante debe pesar hasta 512 KiB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return { originalName: file.name, contentType, contentBase64: btoa(binary) };
}

function optionalText(formData: FormData, key: string) {
  const entry = formData.get(key);
  let text = "";

  if (entry && !(entry instanceof File)) {
    text = entry.trim();
  }

  return text || undefined;
}

function formFile(formData: FormData, key: string) {
  const entry = formData.get(key);
  return entry instanceof File && entry.size ? entry : undefined;
}

function pendingRecords(operations: OfflineOperation[]): PendingRecord[] {
  const records: PendingRecord[] = [];

  for (const operation of operations) {
    if (operation.resource !== "remittances" || operation.status === "synced") {
      continue;
    }

    const payload = merchandisePayloadSchema.safeParse(operation.payload);

    if (payload.success) {
      records.push({ operation, payload: payload.data });
    }
  }

  return records;
}

function queueState(operation: OfflineOperation) {
  if (operation.status === "error" || operation.status === "conflict") {
    return { label: operation.status === "conflict" ? "Conflicto" : "Requiere atención", variant: "warning" as const };
  }

  if (operation.status === "syncing") {
    return { label: "Sincronizando", variant: "secondary" as const };
  }

  return { label: "En este dispositivo", variant: "secondary" as const };
}

function queuedDependencies(operations: OfflineOperation[], recordIds: string[]) {
  return operations
    .filter((operation) => operation.resource === "remittances" && recordIds.includes(operation.resourceId) && operation.status !== "synced")
    .map((operation) => operation.operationId);
}

function queuedPeriod(payload: Extract<MerchandisePayload, { kind: "period" }>, operation: OfflineOperation): MerchandisePeriodRecord {
  const timestamp = new Date(operation.createdAt).toISOString();
  return {
    id: payload.id,
    label: payload.label,
    agency: payload.agency,
    startsAt: new Date(`${payload.startsAt}T00:00:00.000Z`).toISOString(),
    endsAt: new Date(`${payload.endsAt}T00:00:00.000Z`).toISOString(),
    requests: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function queuedRequest(
  payload: Extract<MerchandisePayload, { kind: "request" }>,
  operation: OfflineOperation,
): MerchandiseRequestRecord {
  const timestamp = new Date(operation.createdAt).toISOString();
  return {
    id: payload.id,
    periodId: payload.periodId,
    requestNumber: payload.requestNumber,
    requestedAt: new Date(`${payload.requestedAt}T00:00:00.000Z`).toISOString(),
    requestedQuantity: payload.requestedQuantity,
    status: "PENDIENTE",
    notes: payload.notes ?? null,
    createdBy: { id: operation.userId, name: "En este dispositivo" },
    quota: null,
    remittances: [],
    documents: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function queuedQuota(
  payload: Extract<MerchandisePayload, { kind: "quota" }>,
  operation: OfflineOperation,
): MerchandiseQuotaRecord {
  const timestamp = new Date(operation.createdAt).toISOString();
  return {
    id: payload.id,
    requestId: payload.requestId,
    approvedQuantity: payload.approvedQuantity,
    approvedAt: new Date(`${payload.approvedAt}T00:00:00.000Z`).toISOString(),
    notes: payload.notes ?? null,
    approvedBy: { id: operation.userId, name: "En este dispositivo" },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function queuedRemittance(
  payload: Extract<MerchandisePayload, { kind: "remittance" }>,
  operation: OfflineOperation,
): MerchandiseRemittanceRecord {
  const timestamp = new Date(operation.createdAt).toISOString();
  return {
    id: payload.id,
    requestId: payload.requestId,
    quotaId: payload.quotaId,
    remittanceNumber: payload.remittanceNumber,
    receivedAt: new Date(`${payload.receivedAt}T00:00:00.000Z`).toISOString(),
    receivedQuantity: payload.receivedQuantity,
    responsibleName: payload.responsibleName,
    notes: payload.notes ?? null,
    createdBy: { id: operation.userId, name: "En este dispositivo" },
    documents: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function addQueuedRecords(periods: MerchandisePeriodRecord[], records: PendingRecord[]) {
  const displayedPeriods = periods.map((period) => ({ ...period, requests: [...period.requests] }));

  for (const record of records) {
    if (record.payload.kind === "period") {
      const payload = record.payload;

      if (!displayedPeriods.some((period) => period.id === payload.id)) {
        displayedPeriods.push(queuedPeriod(payload, record.operation));
      }
    }
  }

  for (const record of records) {
    if (record.payload.kind === "request") {
      const payload = record.payload;
      const period = displayedPeriods.find((candidate) => candidate.id === payload.periodId);

      if (period && !period.requests.some((request) => request.id === payload.id)) {
        period.requests.push(queuedRequest(payload, record.operation));
      }
    }
  }

  for (const record of records) {
    if (record.payload.kind === "quota") {
      const payload = record.payload;
      const request = displayedPeriods.flatMap((period) => period.requests).find((candidate) => candidate.id === payload.requestId);

      if (request && !request.quota) {
        request.quota = queuedQuota(payload, record.operation);
        request.status = "APROBADA";
      }
    }
  }

  for (const record of records) {
    if (record.payload.kind === "remittance") {
      const payload = record.payload;
      const request = displayedPeriods.flatMap((period) => period.requests).find((candidate) => candidate.id === payload.requestId);

      if (request && !request.remittances.some((remittance) => remittance.id === payload.id)) {
        request.remittances.push(queuedRemittance(payload, record.operation));
      }
    }
  }

  return displayedPeriods.sort((left, right) => right.startsAt.localeCompare(left.startsAt));
}

interface SaveSheetProps {
  title: string;
  description: string;
  triggerLabel: string;
  children: ReactNode;
  onSave: (formData: FormData) => Promise<void>;
  submitLabel: string;
  triggerVariant?: "default" | "secondary" | "outline";
}

function SaveSheet({
  title,
  description,
  triggerLabel,
  children,
  onSave,
  submitLabel,
  triggerVariant = "default",
}: SaveSheetProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedForm = event.currentTarget;
    setSaving(true);
    setMessage("");

    try {
      await onSave(new FormData(submittedForm));
      setOpen(false);
      submittedForm.reset();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={triggerVariant} className="w-full sm:w-auto">
          <HugeiconsIcon icon={AddCircleIcon} strokeWidth={1.8} data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-xl overflow-y-auto rounded-t-3xl">
        <SheetHeader className="pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <form className="px-6 pb-8" onSubmit={(event) => void handleSubmit(event)}>
          <FieldGroup className="gap-4">{children}</FieldGroup>
          {message ? <Alert variant="destructive" className="mt-5"><AlertTitle>No se guardó</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
          <SheetFooter className="mt-6 flex-row justify-end gap-2">
            <SheetClose asChild><Button type="button" variant="outline">Cancelar</Button></SheetClose>
            <Button type="submit" disabled={saving}>{saving ? "Guardando…" : submitLabel}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function MerchandiseWorkspace({ userId, sessionExpiresAt }: MerchandiseWorkspaceProps) {
  const [periods, setPeriods] = useState<MerchandisePeriodRecord[]>([]);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const synchronizingRef = useRef(false);
  const isOnline = useNetworkStatus();

  const loadMerchandise = useCallback(async () => {
    try {
      const response = await fetch("/api/merchandise", { credentials: "same-origin", cache: "no-store" });

      if (!response.ok) {
        throw new Error("No se pudo actualizar la recepción de mercadería.");
      }

      const body: unknown = await response.json();
      const parsed = merchandiseResponseSchema.safeParse(body);

      if (!parsed.success) {
        throw new Error("El servidor devolvió datos de mercadería que esta versión no reconoce.");
      }

      setPeriods(parsed.data.periods);
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      setOperations(await listOfflineOperations(userId));
    } catch (error) {
      setSyncMessage(errorMessage(error));
    }
  }, [userId]);

  const synchronize = useCallback(async () => {
    if (!isOnline || synchronizingRef.current) {
      return;
    }

    synchronizingRef.current = true;
    setIsSyncing(true);

    try {
      await synchronizeOfflineQueue(userId);
      await Promise.all([loadMerchandise(), refreshQueue()]);
      setSyncMessage("");
    } catch (error) {
      setSyncMessage(errorMessage(error));
    } finally {
      synchronizingRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, loadMerchandise, refreshQueue, userId]);

  useEffect(() => {
    void loadMerchandise();
    void refreshQueue();
    const queueListener = () => void refreshQueue();
    const onlineListener = () => {
      void synchronize();
      void loadMerchandise();
    };
    window.addEventListener("offline-queue-change", queueListener);
    window.addEventListener("online", onlineListener);

    return () => {
      window.removeEventListener("offline-queue-change", queueListener);
      window.removeEventListener("online", onlineListener);
    };
  }, [loadMerchandise, refreshQueue, synchronize]);

  useEffect(() => {
    if (isOnline) {
      void synchronize();
    }
  }, [isOnline, synchronize]);

  async function savePayload(payload: MerchandisePayload, dependencyRecordIds: string[]) {
    const parsedPayload = merchandisePayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new Error(parsedPayload.error.issues[0]?.message ?? "Revisá los datos del formulario.");
    }

    const currentOperations = await listOfflineOperations(userId);
    const operation = await enqueueOfflineOperation(userId, sessionExpiresAt, {
      resource: "remittances",
      resourceId: parsedPayload.data.id,
      operation: "create",
      baseVersion: null,
      dependencies: queuedDependencies(currentOperations, dependencyRecordIds),
      payload: z.json().parse(JSON.parse(JSON.stringify(parsedPayload.data))),
    });
    setOperations((existingOperations) => [...existingOperations, operation]);

    if (isOnline) {
      await synchronizeOfflineQueue(userId);
      await Promise.all([loadMerchandise(), refreshQueue()]);
    }
  }

  async function correctRemittanceConflict(operation: OfflineOperation, payload: MerchandisePayload, formData: FormData) {
    if (payload.kind !== "remittance") {
      return;
    }

    const newNumber = optionalText(formData, "remittanceNumber");
    const newQuantityText = optionalText(formData, "receivedQuantity");
    const correctedPayload: MerchandisePayload = {
      ...payload,
      ...(newNumber ? { remittanceNumber: newNumber } : {}),
      ...(newQuantityText ? { receivedQuantity: Number(newQuantityText) } : {}),
    };
    const payloadJson = z.json().parse(JSON.stringify(correctedPayload));
    await updateOfflineOperationPayload(userId, operation.operationId, payloadJson);
    await Promise.all([refreshQueue(), synchronize()]);
  }

  const localRecords = useMemo(() => pendingRecords(operations), [operations]);
  const visiblePeriods = useMemo(() => addQueuedRecords(periods, localRecords), [localRecords, periods]);
  const pendingOperations = operations.filter((operation) => operation.resource === "remittances" && operation.status !== "synced");
  const queuedPeriodIds = new Set(localRecords.filter((record) => record.payload.kind === "period").map((record) => record.payload.id));

  async function createPeriod(formData: FormData) {
    await savePayload({
      kind: "period",
      id: crypto.randomUUID(),
      label: String(formData.get("label") ?? ""),
      agency: String(formData.get("agency") ?? ""),
      startsAt: String(formData.get("startsAt") ?? ""),
      endsAt: String(formData.get("endsAt") ?? ""),
    }, []);
  }

  async function createRequest(periodId: string, formData: FormData) {
    const requestedQuantity = Number(formData.get("requestedQuantity"));
    const document = await encodeDocument(formFile(formData, "document"));
    const payload = {
      kind: "request" as const,
      id: crypto.randomUUID(),
      periodId,
      requestNumber: String(formData.get("requestNumber") ?? ""),
      requestedAt: String(formData.get("requestedAt") ?? ""),
      requestedQuantity,
      notes: optionalText(formData, "notes"),
      document,
    };
    await savePayload(payload, [periodId]);
  }

  async function approveQuota(request: MerchandiseRequestRecord, formData: FormData) {
    const approvedQuantity = Number(formData.get("approvedQuantity"));
    const document = await encodeDocument(formFile(formData, "document"));
    const payload = {
      kind: "quota" as const,
      id: crypto.randomUUID(),
      requestId: request.id,
      approvedQuantity,
      approvedAt: String(formData.get("approvedAt") ?? ""),
      notes: optionalText(formData, "notes"),
      document,
    };
    await savePayload(payload, [request.id]);
  }

  async function receiveRemittance(request: MerchandiseRequestRecord, quota: MerchandiseQuotaRecord, formData: FormData) {
    const receivedQuantity = Number(formData.get("receivedQuantity"));
    const document = await encodeDocument(formFile(formData, "document"));
    const payload = {
      kind: "remittance" as const,
      id: crypto.randomUUID(),
      requestId: request.id,
      quotaId: quota.id,
      remittanceNumber: String(formData.get("remittanceNumber") ?? ""),
      receivedAt: String(formData.get("receivedAt") ?? ""),
      receivedQuantity,
      responsibleName: String(formData.get("responsibleName") ?? ""),
      notes: optionalText(formData, "notes"),
      document,
    };
    const previouslyReceived = request.remittances.reduce((total, remittance) => total + remittance.receivedQuantity, 0);

    if (previouslyReceived + receivedQuantity > quota.approvedQuantity) {
      throw new Error(`La recepción superaría el cupo aprobado de ${quota.approvedQuantity} módulos. Ya figuran ${previouslyReceived}.`);
    }

    await savePayload(payload, [request.id, quota.id]);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Recepción de mercadería</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Períodos, solicitudes, cupos y remitos con comprobantes privados.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Badge variant={isOnline ? "success" : "warning"} className="w-fit">{isOnline ? "Conectado" : "Sin conexión"}</Badge>
          <SaveSheet title="Nuevo período" description="Creá el ciclo del organismo antes de registrar solicitudes." triggerLabel="Nuevo período" onSave={createPeriod} submitLabel="Guardar período">
            <Field><FieldLabel htmlFor="period-label">Nombre del período *</FieldLabel><Input id="period-label" name="label" placeholder="Ej. Septiembre 2026" minLength={2} maxLength={80} required /></Field>
            <Field><FieldLabel htmlFor="period-agency">Organismo *</FieldLabel><Input id="period-agency" name="agency" placeholder="Ministerio de Desarrollo Social" minLength={2} maxLength={120} required /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="period-start">Desde *</FieldLabel><Input id="period-start" name="startsAt" type="date" required /></Field>
              <Field><FieldLabel htmlFor="period-end">Hasta *</FieldLabel><Input id="period-end" name="endsAt" type="date" required /></Field>
            </div>
          </SaveSheet>
        </div>
      </header>

      {!isOnline ? (
        <Alert variant="info"><HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.8} /><AlertTitle>Captura disponible sin conexión</AlertTitle><AlertDescription>Los borradores y comprobantes quedan asociados a esta cuenta en el dispositivo; se enviarán con esta sesión al recuperar internet.</AlertDescription></Alert>
      ) : null}
      {loadError ? <Alert variant="destructive"><AlertTitle>No se pudieron actualizar los datos</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{loadError}<Button variant="outline" size="sm" onClick={() => void loadMerchandise()}>Reintentar</Button></AlertDescription></Alert> : null}
      {syncMessage ? <Alert variant="info"><AlertTitle>Sincronización pendiente</AlertTitle><AlertDescription>{syncMessage}</AlertDescription></Alert> : null}
      {pendingOperations.length ? (
        <Alert variant="info">
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
          <AlertTitle className="flex flex-wrap items-center gap-2">Cambios guardados en este dispositivo <Badge variant="secondary">{pendingOperations.length}</Badge></AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{isOnline ? "Se sincronizan en orden, respetando sus relaciones." : "Se enviarán cuando vuelva la conexión."}</p>
            {pendingOperations.map((operation) => {
              const state = queueState(operation);
              const record = localRecords.find((candidate) => candidate.operation.operationId === operation.operationId);
              let label = "Cambio de mercadería";

              if (record?.payload.kind === "period") {
                label = `Período ${record.payload.label}`;
              } else if (record?.payload.kind === "request") {
                label = `Solicitud ${record.payload.requestNumber}`;
              } else if (record?.payload.kind === "quota") {
                label = "Cupo aprobado";
              } else if (record?.payload.kind === "remittance") {
                label = `Remito ${record.payload.remittanceNumber}`;
              }

              return <div key={operation.operationId} className="rounded-lg border border-border bg-card p-3 text-card-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{label}</strong><Badge variant={state.variant}>{state.label}</Badge></div>
                {record && record.payload.kind !== "period" && record.payload.document ? <p className="mt-1 text-xs text-muted-foreground">Comprobante {record.payload.document.originalName} guardado con el borrador.</p> : null}
                {operation.message ? <p role="alert" className="mt-2 text-sm text-destructive">{operation.message}</p> : null}
                {operation.status === "conflict" && record?.payload.kind === "remittance" ? <RemittanceConflictCorrection operation={operation} payload={record.payload} onCorrect={correctRemittanceConflict} /> : null}
              </div>;
            })}
            <Button size="sm" variant="outline" onClick={() => void synchronize()} disabled={!isOnline || isSyncing}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />{isSyncing ? "Sincronizando…" : "Sincronizar ahora"}</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <nav aria-label="Secciones de mercadería" className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1">
        <Button asChild variant="inverse" size="sm" className="min-w-0 px-1 text-xs sm:text-sm"><a href="#periodos"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} className="hidden sm:block" />Períodos</a></Button>
        <Button asChild variant="ghost" size="sm" className="min-w-0 px-1 text-xs sm:text-sm"><a href="#cupos"><HugeiconsIcon icon={PackageIcon} strokeWidth={1.8} className="hidden sm:block" />Cupos</a></Button>
        <Button asChild variant="ghost" size="sm" className="min-w-0 px-1 text-xs sm:text-sm"><a href="#remitos"><HugeiconsIcon icon={ReceiptTextIcon} strokeWidth={1.8} className="hidden sm:block" />Remitos</a></Button>
      </nav>

      <section id="periodos" aria-labelledby="periods-title" className="scroll-mt-28 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="periods-title" className="font-display text-xl font-semibold">Períodos y solicitudes</h2><p className="text-sm text-muted-foreground">Cada pedido conserva su organismo, fecha y cantidad solicitada.</p></div><Badge variant="secondary">{visiblePeriods.length} períodos</Badge></div>
        {loading ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Cargando solicitudes y remitos…</CardContent></Card> : null}
        {!loading && !visiblePeriods.length ? <Card variant="muted"><CardContent className="flex flex-col items-start gap-3 py-7"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} className="size-6 text-primary" /><div><h3 className="font-semibold">Todavía no hay períodos</h3><p className="text-sm text-muted-foreground">Creá un período para registrar la solicitud de módulos.</p></div></CardContent></Card> : null}
        <div className="flex flex-col gap-4">
          {visiblePeriods.map((period) => {
            const queuedPeriodOperation = operations.find((operation) => operation.resourceId === period.id && operation.status !== "synced");
            const periodIsLocal = queuedPeriodIds.has(period.id);

            return <Card key={period.id} className="overflow-hidden">
              <CardHeader className="gap-4 border-b bg-muted/40 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} className="size-6" /></span><div className="min-w-0"><CardTitle><h3 className="font-display text-lg font-semibold">{period.label}</h3></CardTitle><p className="text-sm text-muted-foreground">{period.agency} · {formatDate(period.startsAt)} – {formatDate(period.endsAt)}</p></div></div>
                <div className="flex flex-col items-start gap-2 sm:items-end"><Badge variant={periodIsLocal ? "warning" : "success"}>{periodIsLocal ? "Solo en este dispositivo" : "Confirmado en servidor"}</Badge><SaveSheet title="Nueva solicitud de módulos" description={`La solicitud quedará asociada a ${period.label}.`} triggerLabel="Registrar solicitud" onSave={(formData) => createRequest(period.id, formData)} submitLabel="Guardar solicitud">
                  <Field><FieldLabel htmlFor={`request-number-${period.id}`}>Número de solicitud *</FieldLabel><Input id={`request-number-${period.id}`} name="requestNumber" maxLength={80} required /></Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`request-date-${period.id}`}>Fecha de presentación *</FieldLabel><Input id={`request-date-${period.id}`} name="requestedAt" type="date" required /></Field><Field><FieldLabel htmlFor={`request-quantity-${period.id}`}>Módulos solicitados *</FieldLabel><Input id={`request-quantity-${period.id}`} name="requestedQuantity" type="number" min="1" max="100000" required /></Field></div>
                  <Field><FieldLabel htmlFor={`request-notes-${period.id}`}>Observaciones</FieldLabel><Textarea id={`request-notes-${period.id}`} name="notes" maxLength={1000} rows={3} /></Field>
                  <DocumentField id={`request-document-${period.id}`} />
                </SaveSheet></div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                {!period.requests.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No hay solicitudes para este período todavía.</p> : null}
                {period.requests.map((request) => <RequestCard key={request.id} period={period} request={request} operations={operations} createQuota={approveQuota} receiveRemittance={receiveRemittance} />)}
              </CardContent>
              {queuedPeriodOperation?.message ? <div className="border-t px-5 py-3 text-sm text-destructive">{queuedPeriodOperation.message}</div> : null}
            </Card>;
          })}
        </div>
      </section>

      <section id="cupos" aria-labelledby="quotas-title" className="scroll-mt-28 space-y-3">
        <div><h2 id="quotas-title" className="font-display text-xl font-semibold">Cupos aprobados</h2><p className="text-sm text-muted-foreground">Cada cupo se registra contra su solicitud; los números de ejemplo ya no se muestran como datos reales.</p></div>
        <Card variant="muted"><CardContent className="flex items-start gap-3 py-4"><HugeiconsIcon icon={PackageIcon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">Los cupos pendientes se identifican dentro de cada solicitud. La suma de remitos no puede superar el total aprobado.</p></CardContent></Card>
      </section>

      <section id="remitos" aria-labelledby="remittances-title" className="scroll-mt-28 space-y-3">
        <div><h2 id="remittances-title" className="font-display text-xl font-semibold">Remitos y recepción</h2><p className="text-sm text-muted-foreground">Los comprobantes se descargan mediante una ruta privada que vuelve a verificar el permiso.</p></div>
        {!visiblePeriods.some((period) => period.requests.some((request) => request.remittances.length)) ? <Card variant="muted"><CardContent className="flex items-center gap-3 py-5"><HugeiconsIcon icon={TruckIcon} strokeWidth={1.8} className="size-6 text-primary" /><p className="text-sm text-muted-foreground">Los remitos recibidos aparecerán vinculados a su solicitud y cupo aprobado.</p></CardContent></Card> : null}
      </section>

      <section id="rendiciones" aria-labelledby="renditions-title" className="scroll-mt-28 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="renditions-title" className="font-display text-xl font-semibold">Rendiciones oficiales</h2><p className="text-sm text-muted-foreground">La preparación y exportación corresponden al ticket COD-1429.</p></div><Badge variant="secondary">Maqueta</Badge></div>
        <Card><CardHeader><CardTitle><h3 className="font-display text-base font-semibold">Control documental del período</h3></CardTitle><p className="text-sm text-muted-foreground">Esta sección es ilustrativa y todavía no consolida ni exporta documentación.</p></CardHeader><CardContent><ul className="flex flex-col gap-3 rounded-xl bg-muted p-3">{renditionChecks.map((item) => <li key={item.label} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="size-4 shrink-0 text-muted-foreground" />{item.label}</span><Badge variant="secondary">{item.status}</Badge></li>)}</ul><Button variant="secondary" className="mt-4 w-full whitespace-normal" disabled><HugeiconsIcon icon={FileSpreadsheetIcon} strokeWidth={1.8} /> Generar planilla oficial de rendición</Button></CardContent></Card>
      </section>
    </div>
  );
}

interface RemittanceConflictCorrectionProps {
  operation: OfflineOperation;
  payload: Extract<MerchandisePayload, { kind: "remittance" }>;
  onCorrect: (operation: OfflineOperation, payload: MerchandisePayload, formData: FormData) => Promise<void>;
}

function RemittanceConflictCorrection({ operation, payload, onCorrect }: RemittanceConflictCorrectionProps) {
  const receiptLimitConflict = receiptLimitConflictSchema.safeParse(operation.remoteSnapshot);
  const duplicateNumberConflict = duplicateRemittanceConflictSchema.safeParse(operation.remoteSnapshot);
  const [message, setMessage] = useState("");

  if (!receiptLimitConflict.success && !duplicateNumberConflict.success) {
    return null;
  }

  const conflictMessage = receiptLimitConflict.success
    ? `El cupo es de ${receiptLimitConflict.data.approvedQuantity} módulos y ya se recibieron ${receiptLimitConflict.data.receivedSoFar}. Ajustá esta entrega o descartá el borrador.`
    : "Ese número de remito ya está registrado. Ingresá el número correcto para volver a intentar.";
  const maximumQuantity = receiptLimitConflict.success
    ? receiptLimitConflict.data.approvedQuantity - receiptLimitConflict.data.receivedSoFar
    : payload.receivedQuantity;

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await onCorrect(operation, payload, new FormData(event.currentTarget));
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return <div className="mt-3 space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
    <p className="text-sm">{conflictMessage}</p>
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void submitCorrection(event)}>
      {receiptLimitConflict.success ? <Field className="flex-1"><FieldLabel htmlFor={`correct-quantity-${operation.operationId}`}>Cantidad corregida *</FieldLabel><Input id={`correct-quantity-${operation.operationId}`} name="receivedQuantity" type="number" min="1" max={maximumQuantity} defaultValue={Math.min(payload.receivedQuantity, maximumQuantity)} required disabled={!maximumQuantity} /></Field> : null}
      {duplicateNumberConflict.success ? <Field className="flex-1"><FieldLabel htmlFor={`correct-number-${operation.operationId}`}>Número de remito *</FieldLabel><Input id={`correct-number-${operation.operationId}`} name="remittanceNumber" maxLength={80} defaultValue="" required /></Field> : null}
      <Button type="submit" size="sm" variant="outline" disabled={receiptLimitConflict.success && !maximumQuantity}>Corregir y reintentar</Button>
    </form>
    {receiptLimitConflict.success && !maximumQuantity ? <p className="text-xs text-muted-foreground">No queda cantidad disponible en el cupo; este borrador no puede registrarse.</p> : null}
    {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
  </div>;
}

interface RequestCardProps {
  period: MerchandisePeriodRecord;
  request: MerchandiseRequestRecord;
  operations: OfflineOperation[];
  createQuota: (request: MerchandiseRequestRecord, formData: FormData) => Promise<void>;
  receiveRemittance: (request: MerchandiseRequestRecord, quota: MerchandiseQuotaRecord, formData: FormData) => Promise<void>;
}

function RequestCard({ period, request, operations, createQuota, receiveRemittance }: RequestCardProps) {
  const queuedRequestOperation = operations.find((operation) => operation.resourceId === request.id && operation.status !== "synced");
  const pendingQuotaOperation = operations.find((operation) => {
    const payload = merchandisePayloadSchema.safeParse(operation.payload);
    return operation.resource === "remittances" && operation.status !== "synced" && payload.success && payload.data.kind === "quota" && payload.data.requestId === request.id;
  });
  const pendingCount = request.remittances.reduce((total, remittance) => total + remittance.receivedQuantity, 0);
  const quota = request.quota;
  const availableQuantity = quota ? quota.approvedQuantity - pendingCount : 0;

  return <article className="rounded-2xl border p-4 sm:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><HugeiconsIcon icon={ReceiptTextIcon} strokeWidth={1.8} /></span><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">Solicitud {request.requestNumber}</h4><Badge variant={request.status === "APROBADA" ? "success" : request.status === "RECHAZADA" ? "destructive" : "secondary"}>{request.status === "APROBADA" ? "Cupo aprobado" : request.status === "RECHAZADA" ? "Rechazada" : "Pendiente de cupo"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{formatDate(request.requestedAt)} · {request.requestedQuantity} módulos · Registró {request.createdBy.name}</p><p className="mt-1 text-xs text-muted-foreground">Período: {period.label}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {!quota && request.status !== "RECHAZADA" ? <SaveSheet title="Registrar cupo aprobado" description={`Solicitud ${request.requestNumber}: se solicitaron ${request.requestedQuantity} módulos.`} triggerLabel="Registrar cupo" triggerVariant="outline" onSave={(formData) => createQuota(request, formData)} submitLabel="Guardar cupo">
          <Field><FieldLabel htmlFor={`quota-quantity-${request.id}`}>Cantidad aprobada *</FieldLabel><Input id={`quota-quantity-${request.id}`} name="approvedQuantity" type="number" min="1" max={request.requestedQuantity} required /><FieldDescription>El cupo no puede superar los {request.requestedQuantity} módulos solicitados.</FieldDescription></Field>
          <Field><FieldLabel htmlFor={`quota-date-${request.id}`}>Fecha de aprobación *</FieldLabel><Input id={`quota-date-${request.id}`} name="approvedAt" type="date" required /></Field>
          <Field><FieldLabel htmlFor={`quota-notes-${request.id}`}>Observaciones</FieldLabel><Textarea id={`quota-notes-${request.id}`} name="notes" maxLength={1000} rows={3} /></Field>
          <DocumentField id={`quota-document-${request.id}`} />
        </SaveSheet> : null}
        {quota && availableQuantity > 0 ? <SaveSheet title="Registrar recepción / remito" description={`Quedan ${availableQuantity} módulos disponibles del cupo aprobado.`} triggerLabel="Registrar remito" triggerVariant="default" onSave={(formData) => receiveRemittance(request, quota, formData)} submitLabel="Guardar remito">
          <Field><FieldLabel htmlFor={`remittance-number-${request.id}`}>Número de remito *</FieldLabel><Input id={`remittance-number-${request.id}`} name="remittanceNumber" maxLength={80} required /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`remittance-date-${request.id}`}>Fecha de recepción *</FieldLabel><Input id={`remittance-date-${request.id}`} name="receivedAt" type="date" required /></Field><Field><FieldLabel htmlFor={`remittance-quantity-${request.id}`}>Módulos recibidos *</FieldLabel><Input id={`remittance-quantity-${request.id}`} name="receivedQuantity" type="number" min="1" max={availableQuantity} required /><FieldDescription>Disponibles: {availableQuantity}</FieldDescription></Field></div>
          <Field><FieldLabel htmlFor={`remittance-manager-${request.id}`}>Responsable de recepción *</FieldLabel><Input id={`remittance-manager-${request.id}`} name="responsibleName" maxLength={120} required /></Field>
          <Field><FieldLabel htmlFor={`remittance-notes-${request.id}`}>Observaciones</FieldLabel><Textarea id={`remittance-notes-${request.id}`} name="notes" maxLength={1000} rows={3} /></Field>
          <DocumentField id={`remittance-document-${request.id}`} />
        </SaveSheet> : null}
        {quota && availableQuantity <= 0 ? <Badge variant="success">Cupo recibido completo</Badge> : null}
      </div>
    </div>
    {queuedRequestOperation?.message ? <p role="alert" className="mt-3 text-sm text-destructive">{queuedRequestOperation.message}</p> : null}
    {pendingQuotaOperation?.message ? <p role="alert" className="mt-3 text-sm text-destructive">{pendingQuotaOperation.message}</p> : null}
    {quota ? <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl bg-muted p-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Cupo aprobado</p><strong>{quota.approvedQuantity} módulos</strong></div><div><p className="text-xs text-muted-foreground">Aprobado por</p><strong>{quota.approvedBy.name}</strong></div><div><p className="text-xs text-muted-foreground">Fecha de aprobación</p><strong>{formatDate(quota.approvedAt)}</strong></div></div> : null}
    {request.notes ? <p className="mt-3 text-sm text-muted-foreground">{request.notes}</p> : null}
    {request.documents.map((document) => <DocumentLink key={document.id} document={document} />)}
    {request.remittances.length ? <div className="mt-4 space-y-3">{request.remittances.map((remittance) => <RemittanceCard key={remittance.id} remittance={remittance} />)}</div> : null}
  </article>;
}

function DocumentField({ id }: { id: string }) {
  return <Field><FieldLabel htmlFor={id}>Comprobante</FieldLabel><Input id={id} name="document" type="file" accept="application/pdf,image/jpeg,image/png" /><FieldDescription>PDF, JPEG o PNG · hasta 512 KiB · acceso privado.</FieldDescription></Field>;
}

function DocumentLink({ document }: { document: MerchandiseRequestRecord["documents"][number] }) {
  return <a className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/api/merchandise/documents/${encodeURIComponent(document.id)}`}><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} />{document.originalName} <span className="text-xs text-muted-foreground">({formatFileSize(document.byteSize)})</span></a>;
}

function RemittanceCard({ remittance }: { remittance: MerchandiseRemittanceRecord }) {
  return <div className="rounded-xl border bg-background p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><HugeiconsIcon icon={TruckIcon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" /><div><div className="flex flex-wrap items-center gap-2"><h5 className="font-semibold">Remito N° {remittance.remittanceNumber}</h5><Badge variant="secondary">{remittance.receivedQuantity} módulos</Badge></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(remittance.receivedAt)} · Recibió {remittance.responsibleName} · Registró {remittance.createdBy.name}</p></div></div><Badge variant="success">Confirmado en servidor</Badge></div>
    {remittance.notes ? <p className="mt-3 text-sm text-muted-foreground">{remittance.notes}</p> : null}
    {remittance.documents.map((document) => <DocumentLink key={document.id} document={document} />)}
  </div>;
}
