"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AddCircleIcon,
  Calendar03Icon,
  CheckmarkCircle01Icon,
  File01Icon,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { enqueueOfflineOperation, listOfflineOperations, resolveOfflineConflict, synchronizeOfflineQueue, updateOfflineOperationPayload } from "@/services/offline-queue.service";
import type { OfflineOperation } from "@/types/offline-operation";
import type { OfflinePreparedDocument } from "@/services/offline-preparation.service";
import type {
  MerchandisePeriodRecord,
  MerchandiseQuotaRecord,
  MerchandiseRemittanceRecord,
  MerchandiseRequestRecord,
} from "@/interfaces/merchandise.interface";
import { RenditionWorkspace } from "@/components/merchandise/RenditionWorkspace";
import { merchandiseCancellationPayloadSchema, merchandiseOperationPayloadSchema, merchandisePayloadSchema, merchandiseUpdatePayloadSchema, type MerchandiseCancellationPayload, type MerchandiseOperationPayload, type MerchandisePayload, type MerchandiseUpdatePayload } from "@/validations/merchandise.validation";
import { z } from "zod";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import clientAxios from "@/utils/clientAxios.util";

interface MerchandiseWorkspaceProps {
  userId: string;
  sessionExpiresAt: string;
  canReadMerchandise: boolean;
  canWriteMerchandise: boolean;
  canReadRenditions: boolean;
  canWriteRenditions: boolean;
  canReviewRenditions: boolean;
  offlineMode?: boolean;
  initialPeriods?: MerchandisePeriodRecord[];
  preparedDocuments?: OfflinePreparedDocument[];
}

interface PendingRecord {
  operation: OfflineOperation;
  payload: MerchandiseOperationPayload;
}

export const merchandiseResponseSchema = z.object({
  periods: z.array(z.object({
    id: z.string(),
    version: z.number().int().positive(),
    label: z.string(),
    agency: z.string(),
    status: z.enum(["VIGENTE", "ANULADO"]),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    beneficiarySheets: z.array(z.object({
      id: z.string(),
      version: z.number().int(),
      createdAt: z.iso.datetime(),
      beneficiaryCount: z.number().int().nonnegative(),
    })),
    renditions: z.array(z.object({
      id: z.string(),
      periodId: z.string(),
      beneficiarySheetId: z.string(),
      reviewStatus: z.enum(["PENDIENTE", "REVISADA", "OBSERVADA"]),
      reviewNotes: z.string().nullable(),
      reviewedAt: z.iso.datetime().nullable(),
      beneficiarySheet: z.object({ id: z.string(), version: z.number().int(), createdAt: z.iso.datetime(), beneficiaryCount: z.number().int().nonnegative() }),
      documents: z.array(z.object({
        id: z.string(),
        documentType: z.enum(["PLANILLA_FIRMADA", "REMITO", "RESPALDO"]),
        version: z.number().int(),
        supersedesId: z.string().nullable(),
        originalName: z.string(),
        byteSize: z.number().int(),
        createdAt: z.iso.datetime(),
      })),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    })),
    requests: z.array(z.object({
      id: z.string(),
      version: z.number().int().positive(),
      periodId: z.string(),
      requestNumber: z.string(),
      requestedAt: z.iso.datetime(),
      requestedQuantity: z.number(),
      status: z.enum(["PENDIENTE", "APROBADA", "RECHAZADA", "CANCELADA"]),
      notes: z.string().nullable(),
      createdBy: z.object({ id: z.string(), name: z.string() }),
      quota: z.object({
        id: z.string(),
        version: z.number().int().positive(),
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
        version: z.number().int().positive(),
        requestId: z.string(),
        quotaId: z.string(),
        remittanceNumber: z.string(),
        receivedAt: z.iso.datetime(),
        receivedQuantity: z.number(),
        responsibleName: z.string(),
        status: z.enum(["VIGENTE", "ANULADO"]),
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

  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Adjuntá un comprobante en formato PDF.");
  }

  if (!file.size || file.size > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    throw new Error("El comprobante debe pesar hasta 512 KiB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(bytes.subarray(0, 5));
  const footer = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024)));

  if (header !== "%PDF-" || !footer.includes("%%EOF")) {
    throw new Error("El archivo no parece un PDF válido. El formulario sigue abierto para corregirlo.");
  }
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return { originalName: file.name, contentType: "application/pdf" as const, contentBase64: btoa(binary) };
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

    const payload = merchandiseOperationPayloadSchema.safeParse(operation.payload);

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
    version: 1,
    label: payload.label,
    agency: payload.agency,
    startsAt: new Date(`${payload.startsAt}T00:00:00.000Z`).toISOString(),
    endsAt: new Date(`${payload.endsAt}T00:00:00.000Z`).toISOString(),
    status: "VIGENTE",
    requests: [],
    beneficiarySheets: [],
    renditions: [],
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
    version: 1,
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
    version: 1,
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
    version: 1,
    requestId: payload.requestId,
    quotaId: payload.quotaId,
    remittanceNumber: payload.remittanceNumber,
    receivedAt: new Date(`${payload.receivedAt}T00:00:00.000Z`).toISOString(),
    receivedQuantity: payload.receivedQuantity,
    responsibleName: payload.responsibleName,
    notes: payload.notes ?? null,
    status: "VIGENTE",
    createdBy: { id: operation.userId, name: "En este dispositivo" },
    documents: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function addQueuedRecords(periods: MerchandisePeriodRecord[], records: PendingRecord[]) {
  const displayedPeriods = periods.map((period) => ({
    ...period,
    requests: period.requests.map((request) => ({ ...request, quota: request.quota ? { ...request.quota } : null, remittances: request.remittances.map((remittance) => ({ ...remittance })) })),
  }));

  for (const record of records) {
    const createPayload = merchandisePayloadSchema.safeParse(record.payload);

    if (record.operation.operation === "create" && createPayload.success && createPayload.data.kind === "period") {
      const payload = createPayload.data;

      if (!displayedPeriods.some((period) => period.id === payload.id)) {
        displayedPeriods.push(queuedPeriod(payload, record.operation));
      }
    }
  }

  for (const record of records) {
    const createPayload = merchandisePayloadSchema.safeParse(record.payload);

    if (record.operation.operation === "create" && createPayload.success && createPayload.data.kind === "request") {
      const payload = createPayload.data;
      const period = displayedPeriods.find((candidate) => candidate.id === payload.periodId);

      if (period && !period.requests.some((request) => request.id === payload.id)) {
        period.requests.push(queuedRequest(payload, record.operation));
      }
    }
  }

  for (const record of records) {
    const createPayload = merchandisePayloadSchema.safeParse(record.payload);

    if (record.operation.operation === "create" && createPayload.success && createPayload.data.kind === "quota") {
      const payload = createPayload.data;
      const request = displayedPeriods.flatMap((period) => period.requests).find((candidate) => candidate.id === payload.requestId);

      if (request && !request.quota) {
        request.quota = queuedQuota(payload, record.operation);
        request.status = "APROBADA";
      }
    }
  }

  for (const record of records) {
    const createPayload = merchandisePayloadSchema.safeParse(record.payload);

    if (record.operation.operation === "create" && createPayload.success && createPayload.data.kind === "remittance") {
      const payload = createPayload.data;
      const request = displayedPeriods.flatMap((period) => period.requests).find((candidate) => candidate.id === payload.requestId);

      if (request && !request.remittances.some((remittance) => remittance.id === payload.id)) {
        request.remittances.push(queuedRemittance(payload, record.operation));
      }
    }
  }

  for (const record of records) {
    if (record.operation.operation === "update") {
      const parsedPayload = merchandiseUpdatePayloadSchema.safeParse(record.payload);

      if (!parsedPayload.success) {
        continue;
      }

      const payload = parsedPayload.data;

      if (payload.kind === "period") {
        const period = displayedPeriods.find((candidate) => candidate.id === payload.id);

        if (period) {
          period.label = payload.label;
          period.agency = payload.agency;
          period.startsAt = new Date(`${payload.startsAt}T00:00:00.000Z`).toISOString();
          period.endsAt = new Date(`${payload.endsAt}T00:00:00.000Z`).toISOString();
        }
      } else if (payload.kind === "request") {
        const request = displayedPeriods.flatMap((period) => period.requests).find((candidate) => candidate.id === payload.id);

        if (request) {
          request.requestNumber = payload.requestNumber;
          request.requestedAt = new Date(`${payload.requestedAt}T00:00:00.000Z`).toISOString();
          request.requestedQuantity = payload.requestedQuantity;
          request.notes = payload.notes ?? null;
        }
      } else if (payload.kind === "quota") {
        const request = displayedPeriods.flatMap((period) => period.requests).find((candidate) => candidate.quota?.id === payload.id);

        if (request?.quota) {
          request.quota.approvedQuantity = payload.approvedQuantity;
          request.quota.approvedAt = new Date(`${payload.approvedAt}T00:00:00.000Z`).toISOString();
          request.quota.notes = payload.notes ?? null;
        }
      } else if (payload.kind === "remittance") {
        const remittance = displayedPeriods.flatMap((period) => period.requests).flatMap((request) => request.remittances).find((candidate) => candidate.id === payload.id);

        if (remittance) {
          remittance.remittanceNumber = payload.remittanceNumber;
          remittance.receivedAt = new Date(`${payload.receivedAt}T00:00:00.000Z`).toISOString();
          remittance.receivedQuantity = payload.receivedQuantity;
          remittance.responsibleName = payload.responsibleName;
          remittance.notes = payload.notes ?? null;
        }
      }
    } else if (record.operation.operation === "delete") {
      const parsedPayload = merchandiseCancellationPayloadSchema.safeParse(record.payload);

      if (!parsedPayload.success) {
        continue;
      }

      const payload = parsedPayload.data;
      if (payload.kind === "period") {
        const period = displayedPeriods.find((candidate) => candidate.id === payload.id);

        if (period) {
          period.status = "ANULADO";
        }
      } else if (payload.kind === "request") {
        const request = displayedPeriods.flatMap((period) => period.requests).find((candidate) => candidate.id === payload.id);

        if (request) {
          request.status = "CANCELADA";
        }
      } else if (payload.kind === "remittance") {
        const remittance = displayedPeriods.flatMap((period) => period.requests).flatMap((request) => request.remittances).find((candidate) => candidate.id === payload.id);

        if (remittance) {
          remittance.status = "ANULADO";
        }
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
  triggerVariant?: "default" | "secondary" | "outline" | "destructive";
  presentation?: "dialog" | "sheet";
}

function SaveSheet({
  title,
  description,
  triggerLabel,
  children,
  onSave,
  submitLabel,
  triggerVariant = "default",
  presentation = "sheet",
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

  const trigger = (
    <Button variant={triggerVariant} className="w-full sm:w-auto">
      <HugeiconsIcon icon={AddCircleIcon} strokeWidth={1.8} data-icon="inline-start" />
      {triggerLabel}
    </Button>
  );
  const dialogForm = (
    <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={(event) => void handleSubmit(event)}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4">
        <FieldGroup className="gap-4">{children}</FieldGroup>
        {message ? <Alert variant="destructive"><AlertTitle>No se guardó</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
      </div>
      <div className="flex shrink-0 flex-row justify-end gap-2 border-t px-6 py-4">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? "Guardando…" : submitLabel}</Button>
      </div>
    </form>
  );

  if (presentation === "dialog") {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {dialogForm}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
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

export function MerchandiseWorkspace({ userId, sessionExpiresAt, canReadMerchandise, canWriteMerchandise, canReadRenditions, canWriteRenditions, canReviewRenditions, offlineMode = false, initialPeriods = [], preparedDocuments = [] }: MerchandiseWorkspaceProps) {
  const [periods, setPeriods] = useState<MerchandisePeriodRecord[]>(initialPeriods);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [loading, setLoading] = useState(!offlineMode);
  const [loadError, setLoadError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const synchronizingRef = useRef(false);
  const isOnline = useNetworkStatus();

  const loadMerchandise = useCallback(async (forceRefresh = false) => {
    if (offlineMode && !forceRefresh) {
      setLoading(false);
      return;
    }

    try {
      const response = await clientAxios.get<unknown>("/api/merchandise", { headers: { "Cache-Control": "no-cache" } });
      const body: unknown = response.data;
      const parsed = merchandiseResponseSchema.safeParse(body);

      if (!parsed.success) {
        throw new Error("El servidor devolvió datos de mercadería que esta versión no reconoce.");
      }

      setPeriods(parsed.data.periods);
      setLoadError("");
    } catch (error) {
      if (isOnline) {
        setLoadError(errorMessage(error));
      } else {
        setLoadError("Sin conexión. Se muestran los períodos y las planillas que ya estaban cargados en esta vista.");
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, offlineMode]);

  const refreshServerData = useCallback(() => loadMerchandise(true), [loadMerchandise]);

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
      await Promise.all([loadMerchandise(true), refreshQueue()]);
      setSyncMessage("");
    } catch (error) {
      setSyncMessage(errorMessage(error));
    } finally {
      synchronizingRef.current = false;
      setIsSyncing(false);
    }
  }, [isOnline, loadMerchandise, refreshQueue, userId]);

  useEffect(() => {
    if (offlineMode) {
      void refreshQueue();
      const queueListener = () => void refreshQueue();
      const serverDataListener = () => void refreshServerData();
      window.addEventListener("offline-queue-change", queueListener);
      window.addEventListener("merendar-server-data-changed", serverDataListener);

      return () => {
        window.removeEventListener("offline-queue-change", queueListener);
        window.removeEventListener("merendar-server-data-changed", serverDataListener);
      };
    }

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
  }, [loadMerchandise, offlineMode, refreshQueue, refreshServerData, synchronize]);

  useEffect(() => {
    if (isOnline && !offlineMode) {
      void synchronize();
    }
  }, [isOnline, offlineMode, synchronize]);

  async function savePayload(payload: MerchandiseOperationPayload, dependencyRecordIds: string[], operation: "create" | "update" | "delete" = "create", baseVersion: number | null = null) {
    const parsedPayload = merchandiseOperationPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      throw new Error(parsedPayload.error.issues[0]?.message ?? "Revisá los datos del formulario.");
    }

    const currentOperations = await listOfflineOperations(userId);
    const queuedOperation = await enqueueOfflineOperation(userId, sessionExpiresAt, {
      resource: "remittances",
      resourceId: parsedPayload.data.id,
      operation,
      baseVersion,
      dependencies: queuedDependencies(currentOperations, dependencyRecordIds),
      payload: z.json().parse(JSON.parse(JSON.stringify(parsedPayload.data))),
    });
    setOperations((existingOperations) => [...existingOperations, queuedOperation]);

    if (isOnline && !offlineMode) {
      await synchronizeOfflineQueue(userId);
      await Promise.all([loadMerchandise(true), refreshQueue()]);
    }
  }

  async function correctRecord(payload: MerchandiseUpdatePayload, baseVersion: number, dependencyRecordIds: string[] = []) {
    await savePayload(payload, dependencyRecordIds, "update", baseVersion);
  }

  async function cancelRecord(payload: MerchandiseCancellationPayload, baseVersion: number, dependencyRecordIds: string[] = []) {
    await savePayload(payload, dependencyRecordIds, "delete", baseVersion);
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
  let periodStatus: "loading" | "error" | "offline-unprepared" | "empty" | "ready" = "loading";

  if (!loading && visiblePeriods.length) {
    periodStatus = "ready";
  } else if (!loading && isOnline && loadError) {
    periodStatus = "error";
  } else if (!loading && !isOnline) {
    periodStatus = "offline-unprepared";
  } else if (!loading) {
    periodStatus = "empty";
  }
  let periodCountLabel = "Sin preparar";

  if (periodStatus === "ready") {
    periodCountLabel = `${visiblePeriods.length} períodos`;
  } else if (periodStatus === "empty") {
    periodCountLabel = "0 períodos";
  } else if (periodStatus === "loading") {
    periodCountLabel = "Cargando…";
  } else if (periodStatus === "error") {
    periodCountLabel = "No disponible";
  }

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
          {canWriteMerchandise ? <SaveSheet title="Nuevo período" description="Creá el ciclo del organismo antes de registrar solicitudes." triggerLabel="Nuevo período" onSave={createPeriod} submitLabel="Guardar período" presentation="dialog">
            <Field><FieldLabel htmlFor="period-label">Nombre del período *</FieldLabel><Input id="period-label" name="label" placeholder="Ej. Septiembre 2026" minLength={2} maxLength={80} required /></Field>
            <Field><FieldLabel htmlFor="period-agency">Organismo *</FieldLabel><Input id="period-agency" name="agency" placeholder="Ministerio de Desarrollo Social" minLength={2} maxLength={120} required /></Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="period-start">Desde *</FieldLabel><Input id="period-start" name="startsAt" type="date" required /></Field>
              <Field><FieldLabel htmlFor="period-end">Hasta *</FieldLabel><Input id="period-end" name="endsAt" type="date" required /></Field>
            </div>
          </SaveSheet> : null}
        </div>
      </header>

      {!isOnline ? (
        <Alert variant="info"><HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.8} /><AlertTitle>Captura disponible sin conexión</AlertTitle><AlertDescription>Los borradores y comprobantes quedan asociados a esta cuenta en el dispositivo; se enviarán con esta sesión al recuperar internet.</AlertDescription></Alert>
      ) : null}
      {loadError ? <Alert variant="destructive"><AlertTitle>No se pudieron actualizar los datos</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{loadError}<Button variant="outline" size="sm" onClick={() => void loadMerchandise()}>Reintentar</Button></AlertDescription></Alert> : null}
      {syncMessage ? <Alert variant="info"><AlertTitle>Sincronización pendiente</AlertTitle><AlertDescription>{syncMessage}</AlertDescription></Alert> : null}
      {canWriteMerchandise && pendingOperations.length ? (
        <Alert variant="info">
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
          <AlertTitle className="flex flex-wrap items-center gap-2">Cambios guardados en este dispositivo <Badge variant="secondary">{pendingOperations.length}</Badge></AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{isOnline ? "Se sincronizan en orden, respetando sus relaciones." : "Se enviarán cuando vuelva la conexión."}</p>
            {pendingOperations.map((operation) => {
              const state = queueState(operation);
              const record = localRecords.find((candidate) => candidate.operation.operationId === operation.operationId);
              let label = "Cambio de mercadería";

              if (record && operation.operation === "create") {
                const payload = merchandisePayloadSchema.safeParse(record.payload);

                if (payload.success && payload.data.kind === "period") {
                  label = `Período ${payload.data.label}`;
                } else if (payload.success && payload.data.kind === "request") {
                  label = `Solicitud ${payload.data.requestNumber}`;
                } else if (payload.success && payload.data.kind === "quota") {
                  label = "Cupo aprobado";
                } else if (payload.success && payload.data.kind === "remittance") {
                  label = `Remito ${payload.data.remittanceNumber}`;
                }
              } else if (record && operation.operation === "update") {
                const payload = merchandiseUpdatePayloadSchema.safeParse(record.payload);
                if (payload.success) {
                  label = `Corrección de ${payload.data.kind}`;
                }
              } else if (record && operation.operation === "delete") {
                const payload = merchandiseCancellationPayloadSchema.safeParse(record.payload);
                if (payload.success) {
                  label = `Anulación de ${payload.data.kind}`;
                }
              }

              return <div key={operation.operationId} className="rounded-lg border border-border bg-card p-3 text-card-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{label}</strong><Badge variant={state.variant}>{state.label}</Badge></div>
                {record && operation.operation === "create" ? <PendingDocumentSummary payload={record.payload} /> : null}
                {operation.message ? <p role="alert" className="mt-2 text-sm text-destructive">{operation.message}</p> : null}
                {operation.status === "conflict" && record && operation.operation === "create" ? <CreateConflictCorrection operation={operation} payload={record.payload} userId={userId} onCorrect={correctRemittanceConflict} onResolved={refreshQueue} /> : null}
                {operation.status === "conflict" && operation.operation !== "create" ? <ConflictResolutionActions operation={operation} userId={userId} onResolved={refreshQueue} /> : null}
              </div>;
            })}
            <Button size="sm" variant="outline" onClick={() => void synchronize()} disabled={!isOnline || isSyncing}><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} data-icon="inline-start" />{isSyncing ? "Sincronizando…" : "Sincronizar ahora"}</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {canReadMerchandise ? <nav aria-label="Secciones de mercadería" className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1">
        <Button asChild variant="inverse" size="sm" className="min-w-0 px-1 text-xs sm:text-sm"><a href="#periodos"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} className="hidden sm:block" />Períodos</a></Button>
        <Button asChild variant="ghost" size="sm" className="min-w-0 px-1 text-xs sm:text-sm"><a href="#cupos"><HugeiconsIcon icon={PackageIcon} strokeWidth={1.8} className="hidden sm:block" />Cupos</a></Button>
        <Button asChild variant="ghost" size="sm" className="min-w-0 px-1 text-xs sm:text-sm"><a href="#remitos"><HugeiconsIcon icon={ReceiptTextIcon} strokeWidth={1.8} className="hidden sm:block" />Remitos</a></Button>
      </nav> : null}

      {canReadMerchandise ? <>
      <section id="periodos" aria-labelledby="periods-title" className="scroll-mt-28 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="periods-title" className="font-display text-xl font-semibold">Períodos y solicitudes</h2><p className="text-sm text-muted-foreground">Cada pedido conserva su organismo, fecha y cantidad solicitada.</p></div><Badge variant="secondary">{periodCountLabel}</Badge></div>
        {loading ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Cargando solicitudes y remitos…</CardContent></Card> : null}
        {periodStatus === "empty" ? <Card variant="muted"><CardContent className="flex flex-col items-start gap-3 py-7"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} className="size-6 text-primary" /><div><h3 className="font-semibold">Todavía no hay períodos</h3><p className="text-sm text-muted-foreground">{canWriteMerchandise ? "Creá un período para registrar la solicitud de módulos." : "Pedile a Presidencia o Secretaría que cargue un período."}</p></div></CardContent></Card> : null}
        <div className="flex flex-col gap-4">
          {visiblePeriods.map((period) => {
            const queuedPeriodOperation = operations.find((operation) => operation.resourceId === period.id && operation.status !== "synced");
            const periodIsLocal = queuedPeriodIds.has(period.id);

            return <Card key={period.id} className="overflow-hidden">
              <CardHeader className="gap-4 border-b bg-muted/40 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.8} className="size-6" /></span><div className="min-w-0"><CardTitle><h3 className="font-display text-lg font-semibold">{period.label}</h3></CardTitle><p className="text-sm text-muted-foreground">{period.agency} · {formatDate(period.startsAt)} – {formatDate(period.endsAt)}</p></div></div>
                <div className="flex flex-col items-start gap-2 sm:items-end"><Badge variant={period.status === "ANULADO" ? "destructive" : periodIsLocal ? "warning" : "success"}>{period.status === "ANULADO" ? "Período anulado" : periodIsLocal ? "Solo en este dispositivo" : "Confirmado en servidor"}</Badge>{canWriteMerchandise && period.status === "VIGENTE" && !periodIsLocal ? <div className="flex flex-col gap-2 sm:flex-row">
                  <SaveSheet title="Corregir período" description="Los cambios se aplicarán al recuperar conexión y se validará que no haya otra edición concurrente." triggerLabel="Corregir período" triggerVariant="outline" onSave={(formData) => correctRecord({ kind: "period", id: period.id, label: String(formData.get("label") ?? ""), agency: String(formData.get("agency") ?? ""), startsAt: String(formData.get("startsAt") ?? ""), endsAt: String(formData.get("endsAt") ?? "") }, period.version)} submitLabel="Guardar corrección">
                    <Field><FieldLabel htmlFor={`period-edit-label-${period.id}`}>Nombre del período *</FieldLabel><Input id={`period-edit-label-${period.id}`} name="label" defaultValue={period.label} maxLength={80} required /></Field>
                    <Field><FieldLabel htmlFor={`period-edit-agency-${period.id}`}>Organismo *</FieldLabel><Input id={`period-edit-agency-${period.id}`} name="agency" defaultValue={period.agency} maxLength={120} required /></Field>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`period-edit-start-${period.id}`}>Desde *</FieldLabel><Input id={`period-edit-start-${period.id}`} name="startsAt" type="date" defaultValue={period.startsAt.slice(0, 10)} required /></Field><Field><FieldLabel htmlFor={`period-edit-end-${period.id}`}>Hasta *</FieldLabel><Input id={`period-edit-end-${period.id}`} name="endsAt" type="date" defaultValue={period.endsAt.slice(0, 10)} required /></Field></div>
                  </SaveSheet>
                  {period.requests.length === 0 && !period.beneficiarySheets.length && !period.renditions.length ? <SaveSheet title="Anular período" description="El período quedará conservado para auditoría; la anulación no borra datos." triggerLabel="Anular" triggerVariant="destructive" onSave={(formData) => cancelRecord({ kind: "period", id: period.id, action: "cancel", reason: String(formData.get("reason") ?? "") }, period.version)} submitLabel="Anular período">
                    <CancellationReasonField id={`period-cancel-reason-${period.id}`} />
                  </SaveSheet> : <p className="text-xs text-muted-foreground">No se puede anular un período con operaciones o documentos vinculados.</p>}
                </div> : null}{canWriteMerchandise && period.status === "VIGENTE" ? <SaveSheet title="Nueva solicitud de módulos" description={`La solicitud quedará asociada a ${period.label}.`} triggerLabel="Registrar solicitud" onSave={(formData) => createRequest(period.id, formData)} submitLabel="Guardar solicitud">
                  <Field><FieldLabel htmlFor={`request-number-${period.id}`}>Número de solicitud *</FieldLabel><Input id={`request-number-${period.id}`} name="requestNumber" maxLength={80} required /></Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`request-date-${period.id}`}>Fecha de presentación *</FieldLabel><Input id={`request-date-${period.id}`} name="requestedAt" type="date" required /></Field><Field><FieldLabel htmlFor={`request-quantity-${period.id}`}>Módulos solicitados *</FieldLabel><Input id={`request-quantity-${period.id}`} name="requestedQuantity" type="number" min="1" max="100000" required /></Field></div>
                  <Field><FieldLabel htmlFor={`request-notes-${period.id}`}>Observaciones</FieldLabel><Textarea id={`request-notes-${period.id}`} name="notes" maxLength={1000} rows={3} /></Field>
                  <DocumentField id={`request-document-${period.id}`} />
                </SaveSheet> : null}</div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                {!period.requests.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No hay solicitudes para este período todavía.</p> : null}
                {period.requests.map((request) => <RequestCard key={request.id} period={period} request={request} operations={operations} createQuota={approveQuota} receiveRemittance={receiveRemittance} correctRecord={correctRecord} cancelRecord={cancelRecord} canWrite={canWriteMerchandise} />)}
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
      </section></> : null}

      {canReadRenditions ? <RenditionWorkspace periods={visiblePeriods} userId={userId} sessionExpiresAt={sessionExpiresAt} onRefresh={refreshServerData} canWrite={canWriteRenditions} canReview={canReviewRenditions} canCreatePeriods={canReadMerchandise && canWriteMerchandise} periodStatus={periodStatus} offlineMode={offlineMode} preparedDocuments={preparedDocuments} /> : null}
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

function PendingDocumentSummary({ payload }: { payload: MerchandiseOperationPayload }) {
  const parsedPayload = merchandisePayloadSchema.safeParse(payload);

  if (!parsedPayload.success || parsedPayload.data.kind === "period" || !parsedPayload.data.document) {
    return null;
  }

  return <p className="mt-1 text-xs text-muted-foreground">Comprobante {parsedPayload.data.document.originalName} guardado con el borrador.</p>;
}

function CreateConflictCorrection({ operation, payload, userId, onCorrect, onResolved }: { operation: OfflineOperation; payload: MerchandiseOperationPayload; userId: string; onCorrect: (operation: OfflineOperation, payload: MerchandisePayload, formData: FormData) => Promise<void>; onResolved: () => Promise<void> }) {
  const parsedPayload = merchandisePayloadSchema.safeParse(payload);

  if (parsedPayload.success && parsedPayload.data.kind === "remittance") {
    return <RemittanceConflictCorrection operation={operation} payload={parsedPayload.data} onCorrect={onCorrect} />;
  }

  return <ConflictResolutionActions operation={operation} userId={userId} onResolved={onResolved} />;
}

interface RequestCardProps {
  period: MerchandisePeriodRecord;
  request: MerchandiseRequestRecord;
  operations: OfflineOperation[];
  createQuota: (request: MerchandiseRequestRecord, formData: FormData) => Promise<void>;
  receiveRemittance: (request: MerchandiseRequestRecord, quota: MerchandiseQuotaRecord, formData: FormData) => Promise<void>;
  correctRecord: (payload: MerchandiseUpdatePayload, baseVersion: number, dependencyRecordIds?: string[]) => Promise<void>;
  cancelRecord: (payload: MerchandiseCancellationPayload, baseVersion: number, dependencyRecordIds?: string[]) => Promise<void>;
  canWrite: boolean;
}

function RequestCard({ period, request, operations, createQuota, receiveRemittance, correctRecord, cancelRecord, canWrite }: RequestCardProps) {
  const queuedRequestOperation = operations.find((operation) => operation.resourceId === request.id && operation.status !== "synced");
  const pendingQuotaOperation = operations.find((operation) => {
    const createPayload = merchandisePayloadSchema.safeParse(operation.payload);
    const updatePayload = merchandiseUpdatePayloadSchema.safeParse(operation.payload);
    const pendingQuotaCreate = operation.operation === "create" && createPayload.success && createPayload.data.kind === "quota" && createPayload.data.requestId === request.id;
    const pendingQuotaUpdate = operation.operation === "update" && updatePayload.success && updatePayload.data.kind === "quota" && updatePayload.data.id === request.quota?.id;
    return operation.resource === "remittances" && operation.status !== "synced" && (pendingQuotaCreate || pendingQuotaUpdate);
  });
  const pendingCount = request.remittances.reduce((total, remittance) => remittance.status === "VIGENTE" ? total + remittance.receivedQuantity : total, 0);
  const quota = request.quota;
  const availableQuantity = quota ? quota.approvedQuantity - pendingCount : 0;

  return <article className="rounded-2xl border p-4 sm:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><HugeiconsIcon icon={ReceiptTextIcon} strokeWidth={1.8} /></span><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">Solicitud {request.requestNumber}</h4><Badge variant={request.status === "APROBADA" ? "success" : request.status === "RECHAZADA" || request.status === "CANCELADA" ? "destructive" : "secondary"}>{request.status === "APROBADA" ? "Cupo aprobado" : request.status === "RECHAZADA" ? "Rechazada" : request.status === "CANCELADA" ? "Anulada" : "Pendiente de cupo"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{formatDate(request.requestedAt)} · {request.requestedQuantity} módulos · Registró {request.createdBy.name}</p><p className="mt-1 text-xs text-muted-foreground">Período: {period.label}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {canWrite && !quota && request.status !== "RECHAZADA" && request.status !== "CANCELADA" ? <SaveSheet title="Registrar cupo aprobado" description={`Solicitud ${request.requestNumber}: se solicitaron ${request.requestedQuantity} módulos.`} triggerLabel="Registrar cupo" triggerVariant="outline" onSave={(formData) => createQuota(request, formData)} submitLabel="Guardar cupo">
          <Field><FieldLabel htmlFor={`quota-quantity-${request.id}`}>Cantidad aprobada *</FieldLabel><Input id={`quota-quantity-${request.id}`} name="approvedQuantity" type="number" min="1" max={request.requestedQuantity} required /><FieldDescription>El cupo no puede superar los {request.requestedQuantity} módulos solicitados.</FieldDescription></Field>
          <Field><FieldLabel htmlFor={`quota-date-${request.id}`}>Fecha de aprobación *</FieldLabel><Input id={`quota-date-${request.id}`} name="approvedAt" type="date" required /></Field>
          <Field><FieldLabel htmlFor={`quota-notes-${request.id}`}>Observaciones</FieldLabel><Textarea id={`quota-notes-${request.id}`} name="notes" maxLength={1000} rows={3} /></Field>
          <DocumentField id={`quota-document-${request.id}`} />
        </SaveSheet> : null}
        {canWrite && quota && availableQuantity > 0 && request.status !== "CANCELADA" ? <SaveSheet title="Registrar recepción / remito" description={`Quedan ${availableQuantity} módulos disponibles del cupo aprobado.`} triggerLabel="Registrar remito" triggerVariant="default" onSave={(formData) => receiveRemittance(request, quota, formData)} submitLabel="Guardar remito">
          <Field><FieldLabel htmlFor={`remittance-number-${request.id}`}>Número de remito *</FieldLabel><Input id={`remittance-number-${request.id}`} name="remittanceNumber" maxLength={80} required /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`remittance-date-${request.id}`}>Fecha de recepción *</FieldLabel><Input id={`remittance-date-${request.id}`} name="receivedAt" type="date" required /></Field><Field><FieldLabel htmlFor={`remittance-quantity-${request.id}`}>Módulos recibidos *</FieldLabel><Input id={`remittance-quantity-${request.id}`} name="receivedQuantity" type="number" min="1" max={availableQuantity} required /><FieldDescription>Disponibles: {availableQuantity}</FieldDescription></Field></div>
          <Field><FieldLabel htmlFor={`remittance-manager-${request.id}`}>Responsable de recepción *</FieldLabel><Input id={`remittance-manager-${request.id}`} name="responsibleName" maxLength={120} required /></Field>
          <Field><FieldLabel htmlFor={`remittance-notes-${request.id}`}>Observaciones</FieldLabel><Textarea id={`remittance-notes-${request.id}`} name="notes" maxLength={1000} rows={3} /></Field>
          <DocumentField id={`remittance-document-${request.id}`} />
        </SaveSheet> : null}
        {quota && availableQuantity <= 0 ? <Badge variant="success">Cupo recibido completo</Badge> : null}
        {canWrite && !queuedRequestOperation && request.status !== "CANCELADA" && request.status !== "RECHAZADA" ? <SaveSheet title="Corregir solicitud" description="El cambio se valida contra la versión vigente y conserva los comprobantes cargados." triggerLabel="Corregir solicitud" triggerVariant="outline" onSave={(formData) => correctRecord({ kind: "request", id: request.id, requestNumber: String(formData.get("requestNumber") ?? ""), requestedAt: String(formData.get("requestedAt") ?? ""), requestedQuantity: Number(formData.get("requestedQuantity")), notes: optionalText(formData, "notes") }, request.version, [request.id])} submitLabel="Guardar corrección">
          <Field><FieldLabel htmlFor={`request-edit-number-${request.id}`}>Número de solicitud *</FieldLabel><Input id={`request-edit-number-${request.id}`} name="requestNumber" defaultValue={request.requestNumber} maxLength={80} required /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`request-edit-date-${request.id}`}>Fecha *</FieldLabel><Input id={`request-edit-date-${request.id}`} name="requestedAt" type="date" defaultValue={request.requestedAt.slice(0, 10)} required /></Field><Field><FieldLabel htmlFor={`request-edit-quantity-${request.id}`}>Cantidad solicitada *</FieldLabel><Input id={`request-edit-quantity-${request.id}`} name="requestedQuantity" type="number" min={quota?.approvedQuantity ?? 1} max="100000" defaultValue={request.requestedQuantity} required /></Field></div>
          <Field><FieldLabel htmlFor={`request-edit-notes-${request.id}`}>Observaciones</FieldLabel><Textarea id={`request-edit-notes-${request.id}`} name="notes" maxLength={1000} rows={3} defaultValue={request.notes ?? ""} /></Field>
        </SaveSheet> : null}
        {canWrite && !queuedRequestOperation && !quota && !request.remittances.length && request.status !== "CANCELADA" ? <SaveSheet title="Anular solicitud" description="La solicitud se conservará junto con sus documentos. Ingresá el motivo para dejar trazabilidad." triggerLabel="Anular solicitud" triggerVariant="destructive" onSave={(formData) => cancelRecord({ kind: "request", id: request.id, action: "cancel", reason: String(formData.get("reason") ?? "") }, request.version, [request.id])} submitLabel="Anular solicitud">
          <CancellationReasonField id={`request-cancel-reason-${request.id}`} />
        </SaveSheet> : null}
        {request.status === "CANCELADA" ? <Badge variant="destructive">Solicitud anulada</Badge> : null}
      </div>
    </div>
    {queuedRequestOperation?.message ? <p role="alert" className="mt-3 text-sm text-destructive">{queuedRequestOperation.message}</p> : null}
    {pendingQuotaOperation?.message ? <p role="alert" className="mt-3 text-sm text-destructive">{pendingQuotaOperation.message}</p> : null}
    {quota ? <div className="mt-4 space-y-3"><div className="grid grid-cols-1 gap-2 rounded-xl bg-muted p-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Cupo aprobado</p><strong>{quota.approvedQuantity} módulos</strong></div><div><p className="text-xs text-muted-foreground">Aprobado por</p><strong>{quota.approvedBy.name}</strong></div><div><p className="text-xs text-muted-foreground">Fecha de aprobación</p><strong>{formatDate(quota.approvedAt)}</strong></div></div>{canWrite && !pendingQuotaOperation ? <SaveSheet title="Corregir cupo" description="El cupo corregido no puede quedar por debajo de las recepciones vigentes ni superar lo solicitado." triggerLabel="Corregir cupo" triggerVariant="outline" onSave={(formData) => correctRecord({ kind: "quota", id: quota.id, approvedQuantity: Number(formData.get("approvedQuantity")), approvedAt: String(formData.get("approvedAt") ?? ""), notes: optionalText(formData, "notes") }, quota.version, [request.id])} submitLabel="Guardar corrección">
      <Field><FieldLabel htmlFor={`quota-edit-quantity-${quota.id}`}>Cantidad aprobada *</FieldLabel><Input id={`quota-edit-quantity-${quota.id}`} name="approvedQuantity" type="number" min={pendingCount || 1} max={request.requestedQuantity} defaultValue={quota.approvedQuantity} required /></Field>
      <Field><FieldLabel htmlFor={`quota-edit-date-${quota.id}`}>Fecha de aprobación *</FieldLabel><Input id={`quota-edit-date-${quota.id}`} name="approvedAt" type="date" defaultValue={quota.approvedAt.slice(0, 10)} required /></Field>
      <Field><FieldLabel htmlFor={`quota-edit-notes-${quota.id}`}>Observaciones</FieldLabel><Textarea id={`quota-edit-notes-${quota.id}`} name="notes" maxLength={1000} rows={3} defaultValue={quota.notes ?? ""} /></Field>
    </SaveSheet> : null}<p className="text-xs text-muted-foreground">El cupo no se anula porque la solicitud conserva un único cupo y sus documentos vinculados.</p></div> : null}
    {request.notes ? <p className="mt-3 text-sm text-muted-foreground">{request.notes}</p> : null}
    {request.documents.map((document) => <DocumentLink key={document.id} document={document} />)}
    {request.remittances.length ? <div className="mt-4 space-y-3">{request.remittances.map((remittance) => <RemittanceCard key={remittance.id} remittance={remittance} operations={operations} canWrite={canWrite} correctRecord={correctRecord} cancelRecord={cancelRecord} />)}</div> : null}
  </article>;
}

function DocumentField({ id }: { id: string }) {
  return <Field><FieldLabel htmlFor={id}>Comprobante PDF</FieldLabel><Input id={id} name="document" type="file" accept="application/pdf,.pdf" /><FieldDescription>Solo PDF válido · hasta 512 KiB · acceso privado.</FieldDescription></Field>;
}

function DocumentLink({ document }: { document: MerchandiseRequestRecord["documents"][number] }) {
  return <a className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/api/merchandise/documents/${encodeURIComponent(document.id)}`}><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} />{document.originalName} <span className="text-xs text-muted-foreground">({formatFileSize(document.byteSize)})</span></a>;
}

function RemittanceCard({ remittance, operations, canWrite, correctRecord, cancelRecord }: { remittance: MerchandiseRemittanceRecord; operations: OfflineOperation[]; canWrite: boolean; correctRecord: RequestCardProps["correctRecord"]; cancelRecord: RequestCardProps["cancelRecord"] }) {
  const hasPendingChange = operations.some((operation) => operation.resourceId === remittance.id && operation.status !== "synced");

  return <div className="rounded-xl border bg-background p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><HugeiconsIcon icon={TruckIcon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" /><div><div className="flex flex-wrap items-center gap-2"><h5 className="font-semibold">Remito N° {remittance.remittanceNumber}</h5><Badge variant="secondary">{remittance.receivedQuantity} módulos</Badge>{remittance.status === "ANULADO" ? <Badge variant="destructive">Anulado</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{formatDate(remittance.receivedAt)} · Recibió {remittance.responsibleName} · Registró {remittance.createdBy.name}</p></div></div><div className="flex flex-wrap items-center gap-2"><Badge variant={hasPendingChange ? "warning" : "success"}>{hasPendingChange ? "Cambio pendiente" : "Confirmado en servidor"}</Badge>{canWrite && !hasPendingChange && remittance.status === "VIGENTE" ? <>
      <SaveSheet title="Corregir remito" description="Los comprobantes existentes se conservarán y se verificará el saldo del cupo." triggerLabel="Corregir" triggerVariant="outline" onSave={(formData) => correctRecord({ kind: "remittance", id: remittance.id, remittanceNumber: String(formData.get("remittanceNumber") ?? ""), receivedAt: String(formData.get("receivedAt") ?? ""), receivedQuantity: Number(formData.get("receivedQuantity")), responsibleName: String(formData.get("responsibleName") ?? ""), notes: optionalText(formData, "notes") }, remittance.version, [remittance.requestId, remittance.quotaId])} submitLabel="Guardar corrección">
        <Field><FieldLabel htmlFor={`remittance-edit-number-${remittance.id}`}>Número de remito *</FieldLabel><Input id={`remittance-edit-number-${remittance.id}`} name="remittanceNumber" defaultValue={remittance.remittanceNumber} maxLength={80} required /></Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor={`remittance-edit-date-${remittance.id}`}>Fecha *</FieldLabel><Input id={`remittance-edit-date-${remittance.id}`} name="receivedAt" type="date" defaultValue={remittance.receivedAt.slice(0, 10)} required /></Field><Field><FieldLabel htmlFor={`remittance-edit-quantity-${remittance.id}`}>Cantidad recibida *</FieldLabel><Input id={`remittance-edit-quantity-${remittance.id}`} name="receivedQuantity" type="number" min="1" defaultValue={remittance.receivedQuantity} required /></Field></div>
        <Field><FieldLabel htmlFor={`remittance-edit-responsible-${remittance.id}`}>Responsable *</FieldLabel><Input id={`remittance-edit-responsible-${remittance.id}`} name="responsibleName" defaultValue={remittance.responsibleName} maxLength={120} required /></Field>
        <Field><FieldLabel htmlFor={`remittance-edit-notes-${remittance.id}`}>Observaciones</FieldLabel><Textarea id={`remittance-edit-notes-${remittance.id}`} name="notes" maxLength={1000} rows={3} defaultValue={remittance.notes ?? ""} /></Field>
      </SaveSheet>
      <SaveSheet title="Anular remito" description="El remito y sus comprobantes quedarán en el historial. La cantidad se libera del cupo." triggerLabel="Anular" triggerVariant="destructive" onSave={(formData) => cancelRecord({ kind: "remittance", id: remittance.id, action: "cancel", reason: String(formData.get("reason") ?? "") }, remittance.version, [remittance.requestId, remittance.quotaId])} submitLabel="Anular remito"><CancellationReasonField id={`remittance-cancel-reason-${remittance.id}`} /></SaveSheet>
    </> : null}</div></div>
    {remittance.notes ? <p className="mt-3 text-sm text-muted-foreground">{remittance.notes}</p> : null}
    {remittance.documents.map((document) => <DocumentLink key={document.id} document={document} />)}
  </div>;
}

function CancellationReasonField({ id }: { id: string }) {
  return <Field><FieldLabel htmlFor={id}>Motivo de anulación *</FieldLabel><Textarea id={id} name="reason" minLength={3} maxLength={500} rows={3} required /></Field>;
}

function ConflictResolutionActions({ operation, userId, onResolved }: { operation: OfflineOperation; userId: string; onResolved: () => Promise<void> }) {
  const [message, setMessage] = useState("");

  async function resolve(resolution: "local" | "server") {
    try {
      await resolveOfflineConflict(userId, operation.operationId, resolution);
      await onResolved();
      setMessage("");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  return <div className="mt-3 space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
    <p className="text-sm">Este registro cambió en otro dispositivo. Revisá la versión actual antes de decidir qué conservar.</p>
    <div className="flex flex-wrap gap-2">{operation.operation !== "create" ? <Button type="button" size="sm" variant="outline" onClick={() => void resolve("local")}>Reaplicar mi cambio</Button> : null}<Button type="button" size="sm" variant="secondary" onClick={() => void resolve("server")}>Descartar mi cambio</Button></div>
    {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
  </div>;
}
