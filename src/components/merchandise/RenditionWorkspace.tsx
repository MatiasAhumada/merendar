"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle01Icon, File01Icon, RefreshIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RENDITION_DOCUMENT_LABELS, RENDITION_DOCUMENT_TYPES, RENDITION_LIMITS } from "@/constants/rendition.constant";
import { synchronizeOfflineQueue, enqueueOfflineOperation, listOfflineOperations, retryOfflineOperation, updateOfflineOperationPayload } from "@/services/offline-queue.service";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import type { MerchandisePeriodRecord } from "@/interfaces/merchandise.interface";
import type { OfflinePreparedDocument } from "@/services/offline-preparation.service";
import type { OfflineOperation } from "@/types/offline-operation";
import {
  renditionDocumentPayloadSchema,
  renditionReviewOperationPayloadSchema,
  renditionReviewPayloadSchema,
  type RenditionDocumentPayload,
} from "@/validations/rendition.validation";
import { z } from "zod";

interface RenditionWorkspaceProps {
  periods: MerchandisePeriodRecord[];
  userId: string;
  sessionExpiresAt: string;
  onRefresh: () => Promise<void>;
  canWrite: boolean;
  canReview: boolean;
  canCreatePeriods: boolean;
  periodStatus: "loading" | "error" | "offline-unprepared" | "empty" | "ready";
  offlineMode?: boolean;
  preparedDocuments?: OfflinePreparedDocument[];
}

const documentTypeSchema = z.enum([
  RENDITION_DOCUMENT_TYPES.SIGNED_SHEET,
  RENDITION_DOCUMENT_TYPES.REMITTANCE,
  RENDITION_DOCUMENT_TYPES.SUPPORTING,
]);

function formatFileSize(byteSize: number) {
  return `${Math.max(1, Math.round(byteSize / 1024))} KiB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo guardar el documento.";
}

async function encodePdf(file: File) {
  if (!file.size || file.size > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    throw new Error("Cada PDF debe pesar hasta 512 KiB y no puede estar vacío.");
  }

  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Elegí un archivo PDF. Las imágenes no reemplazan la planilla escaneada.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  const footer = new TextDecoder("latin1").decode(bytes.slice(Math.max(0, bytes.length - 1024)));

  if (header !== "%PDF-" || !footer.includes("%%EOF")) {
    throw new Error("El contenido no parece un PDF completo. Volvé a exportarlo y seleccionalo de nuevo.");
  }

  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return { originalName: file.name, contentType: "application/pdf" as const, contentBase64: btoa(binary) };
}

function renditionOperations(operations: OfflineOperation[]) {
  const parsedOperations: Array<{ operation: OfflineOperation; payload: RenditionDocumentPayload }> = [];

  for (const operation of operations) {
    if (operation.resource !== "renditions" || operation.status === "synced") {
      continue;
    }

    const parsedPayload = renditionDocumentPayloadSchema.safeParse(operation.payload);

    if (parsedPayload.success) {
      parsedOperations.push({ operation, payload: parsedPayload.data });
    }
  }

  return parsedOperations;
}

function pendingReviewOperations(operations: OfflineOperation[]) {
  const pendingReviews: Array<{ operation: OfflineOperation; payload: z.infer<typeof renditionReviewOperationPayloadSchema> }> = [];

  for (const operation of operations) {
    if (operation.resource !== "renditions" || operation.status === "synced") {
      continue;
    }

    const parsedPayload = renditionReviewOperationPayloadSchema.safeParse(operation.payload);
    if (parsedPayload.success) {
      pendingReviews.push({ operation, payload: parsedPayload.data });
    }
  }

  return pendingReviews;
}

function operationLabel(status: OfflineOperation["status"]) {
  if (status === "error" || status === "conflict") {
    return "Error de carga";
  }

  if (status === "syncing") {
    return "Subiendo…";
  }

  return "Pendiente offline";
}

function PreparedRenditionDocumentLink({ document, label, download = false }: { document: OfflinePreparedDocument; label: string; download?: boolean }) {
  const [documentUrl] = useState(() => URL.createObjectURL(document.content));

  useEffect(() => () => URL.revokeObjectURL(documentUrl), [documentUrl]);

  return <Button asChild size="sm" variant={download ? "secondary" : "outline"}><a href={documentUrl} target={download ? undefined : "_blank"} rel={download ? undefined : "noreferrer"} download={document.originalName}>{label}</a></Button>;
}

function SheetDocumentLink({ sheetId, offlineMode, preparedDocuments }: { sheetId: string; offlineMode: boolean; preparedDocuments: OfflinePreparedDocument[] }) {
  if (offlineMode) {
    const preparedDocument = preparedDocuments.find((document) => document.id === sheetId);
    if (!preparedDocument) {
      return <p className="text-xs text-muted-foreground">La planilla no está guardada en esta preparación offline.</p>;
    }
    return <PreparedRenditionDocumentLink document={preparedDocument} label="Abrir planilla preparada" download />;
  }

  return <Button asChild size="sm" variant="outline"><a href={`/api/records/sheets/${encodeURIComponent(sheetId)}`}><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} data-icon="inline-start" /> Descargar para imprimir</a></Button>;
}

function RenditionDocumentActions({ documentId, preparedDocument, offlineMode }: { documentId: string; preparedDocument: OfflinePreparedDocument | undefined; offlineMode: boolean }) {
  if (offlineMode) {
    if (!preparedDocument) {
      return <Badge variant="warning">PDF no preparado</Badge>;
    }
    return <><PreparedRenditionDocumentLink document={preparedDocument} label="Previsualizar" /><PreparedRenditionDocumentLink document={preparedDocument} label="Descargar" download /></>;
  }

  return <><Button asChild size="sm" variant="outline"><a href={`/api/renditions/documents/${encodeURIComponent(documentId)}?inline=1`} target="_blank" rel="noreferrer">Previsualizar</a></Button><Button asChild size="sm" variant="secondary"><a href={`/api/renditions/documents/${encodeURIComponent(documentId)}`}>Descargar</a></Button></>;
}

function reviewLabel(status: "PENDIENTE" | "REVISADA" | "OBSERVADA") {
  if (status === "REVISADA") {
    return "Revisada manualmente";
  }

  if (status === "OBSERVADA") {
    return "Requiere corrección";
  }

  return "Pendiente de revisión";
}

function createReviewPayload(status: "REVISADA" | "OBSERVADA", notes: string) {
  if (status === "OBSERVADA") {
    return { status, notes: notes.trim() };
  }

  return { status };
}

export function RenditionWorkspace({ periods, userId, sessionExpiresAt, onRefresh, canWrite, canReview, canCreatePeriods, periodStatus, offlineMode = false, preparedDocuments = [] }: RenditionWorkspaceProps) {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedSheetId, setSelectedSheetId] = useState("");
  const [selectedType, setSelectedType] = useState<z.infer<typeof documentTypeSchema>>(RENDITION_DOCUMENT_TYPES.SIGNED_SHEET);
  const [selectedReplacementId, setSelectedReplacementId] = useState("");
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"REVISADA" | "OBSERVADA">("REVISADA");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const isOnline = useNetworkStatus();

  const refreshQueue = useCallback(async () => {
    try {
      setOperations(await listOfflineOperations(userId));
    } catch (error) {
      setActionMessage(errorMessage(error));
    }
  }, [userId]);

  useEffect(() => {
    void refreshQueue();
    const queueListener = () => void refreshQueue();
    window.addEventListener("offline-queue-change", queueListener);
    return () => window.removeEventListener("offline-queue-change", queueListener);
  }, [refreshQueue]);

  useEffect(() => {
    if (isOnline && !offlineMode) {
      void synchronizeOfflineQueue(userId).then(async () => {
        await Promise.all([refreshQueue(), onRefresh()]);
      });
    }
  }, [isOnline, offlineMode, onRefresh, refreshQueue, userId]);

  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? periods[0];
  const selectedSheet = selectedPeriod?.beneficiarySheets.find((sheet) => sheet.id === selectedSheetId) ?? selectedPeriod?.beneficiarySheets[0];
  const selectedRendition = selectedPeriod?.renditions.find((rendition) => rendition.beneficiarySheetId === selectedSheet?.id);
  const visibleOperations = useMemo(() => renditionOperations(operations), [operations]);
  const visibleReviewOperations = useMemo(() => pendingReviewOperations(operations), [operations]);
  const visibleDocuments = selectedRendition?.documents ?? [];
  const currentDocuments = visibleDocuments.filter((document) => !visibleDocuments.some((candidate) => candidate.supersedesId === document.id));
  const queuedUploads = visibleOperations.filter(({ payload }) => payload.beneficiarySheetId === selectedSheet?.id);
  const pendingDocumentCount = queuedUploads.reduce((count, upload) => count + upload.payload.documents.length, 0);
  const queuedReview = visibleReviewOperations.find(({ payload }) => payload.id === selectedRendition?.id);
  const hasSignedSheet = currentDocuments.some((document) => document.documentType === RENDITION_DOCUMENT_TYPES.SIGNED_SHEET) ||
    queuedUploads.some(({ payload }) => payload.documents.some((document) => document.type === RENDITION_DOCUMENT_TYPES.SIGNED_SHEET));
  let periodAvailabilityMessage = "";

  if (periodStatus === "loading") {
    periodAvailabilityMessage = "Cargando períodos…";
  } else if (periodStatus === "error") {
    periodAvailabilityMessage = "No se pudo confirmar si hay períodos. Reintentá la carga antes de seleccionar.";
  } else if (periodStatus === "offline-unprepared") {
    periodAvailabilityMessage = "No hay períodos preparados en esta vista sin conexión.";
  } else if (periodStatus === "empty") {
    periodAvailabilityMessage = "No hay períodos cargados.";
  }

  useEffect(() => {
    if (!periods.some((period) => period.id === selectedPeriodId)) {
      setSelectedPeriodId(periods[0]?.id ?? "");
    }
  }, [periods, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriod?.beneficiarySheets.some((sheet) => sheet.id === selectedSheetId)) {
      setSelectedSheetId(selectedPeriod?.beneficiarySheets[0]?.id ?? "");
    }
  }, [selectedPeriod, selectedSheetId]);

  function onTypeChange(value: string) {
    const parsedType = documentTypeSchema.safeParse(value);

    if (parsedType.success) {
      setSelectedType(parsedType.data);
      setSelectedReplacementId("");
    }
  }

  async function submitDocuments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUploading(true);
    setActionMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      if (!selectedPeriod || !selectedSheet) {
        throw new Error("Seleccioná un período y una planilla emitida antes de adjuntar documentos.");
      }

      const files = form.getAll("documents").filter((entry): entry is File => entry instanceof File && entry.size > 0);

      if (!files.length || files.length > RENDITION_LIMITS.MAX_DOCUMENTS_PER_UPLOAD) {
        throw new Error("Seleccioná entre 1 y 5 archivos PDF por carga.");
      }

      if (files.length > 1 && selectedReplacementId) {
        throw new Error("Para corregir una versión anterior, seleccioná un solo archivo PDF.");
      }

      const selectedBytes = files.reduce((total, file) => total + file.size, 0);

      if (selectedBytes > RENDITION_LIMITS.MAX_UPLOAD_BYTES) {
        throw new Error("La selección completa no puede superar 700 KiB por carga.");
      }

      const documents = await Promise.all(files.map(async (file) => ({
        id: crypto.randomUUID(),
        type: selectedType,
        ...(selectedReplacementId ? { supersedesId: selectedReplacementId } : {}),
        ...(await encodePdf(file)),
      })));
      const payload: RenditionDocumentPayload = {
        kind: "rendition_documents",
        id: crypto.randomUUID(),
        periodId: selectedPeriod.id,
        beneficiarySheetId: selectedSheet.id,
        documents,
      };
      const parsedPayload = renditionDocumentPayloadSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new Error(parsedPayload.error.issues[0]?.message ?? "La selección supera el límite permitido.");
      }

      const operation = await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "renditions",
        resourceId: payload.id,
        operation: "create",
        baseVersion: null,
        dependencies: [],
        payload: z.json().parse(JSON.parse(JSON.stringify(payload))),
      });
      setOperations((existingOperations) => [...existingOperations, operation]);
      setSelectedFileNames([]);
      formElement.reset();

      if (isOnline) {
        await synchronizeOfflineQueue(userId);
        await Promise.all([refreshQueue(), onRefresh()]);
      }
    } catch (error) {
      setActionMessage(errorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>, renditionId: string) {
    event.preventDefault();
    setReviewMessage("");
    const review = createReviewPayload(reviewStatus, reviewNotes);
    const parsedReview = renditionReviewPayloadSchema.safeParse(review);

    if (!parsedReview.success) {
      setReviewMessage(parsedReview.error.issues[0]?.message ?? "Revisá los datos de revisión.");
      return;
    }

    try {
      const payload = renditionReviewOperationPayloadSchema.parse({
        kind: "rendition_review",
        id: renditionId,
        ...parsedReview.data,
      });
      await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "renditions",
        resourceId: renditionId,
        operation: "create",
        baseVersion: null,
        dependencies: [],
        payload: z.json().parse(JSON.parse(JSON.stringify(payload))),
      });
      setReviewNotes("");
      let savedReviewMessage = "Revisión pendiente en este dispositivo; se confirmará cuando el servidor valide la sesión y los permisos.";
      if (isOnline) {
        savedReviewMessage = "Revisión guardada y enviada para validación del servidor.";
      }
      setReviewMessage(savedReviewMessage);
      await refreshQueue();
      if (isOnline) {
        await synchronizeOfflineQueue(userId);
        await Promise.all([refreshQueue(), onRefresh()]);
      }
    } catch (error) {
      setReviewMessage(errorMessage(error));
    }
  }

  return <Card id="rendiciones" aria-labelledby="renditions-title" className="scroll-mt-28">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle id="renditions-title" className="font-display text-xl">Rendición documental</CardTitle>
          <CardDescription>Vinculá los PDF escaneados con la planilla emitida y el período correspondiente.</CardDescription>
        </div>
        {selectedRendition ? <Badge variant={selectedRendition.reviewStatus === "REVISADA" ? "success" : selectedRendition.reviewStatus === "OBSERVADA" ? "warning" : "secondary"}>{reviewLabel(selectedRendition.reviewStatus)}</Badge> : null}
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      {!isOnline ? <Alert variant="info"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} /><AlertTitle>La carga queda pendiente en este dispositivo</AlertTitle><AlertDescription>El PDF se conserva asociado a esta cuenta y a la planilla elegida. No se considera guardado en el servidor ni habilita una presentación hasta que termine la sincronización.</AlertDescription></Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="rendition-period">Módulo o período</FieldLabel>
          <Select value={selectedPeriod?.id ?? ""} onValueChange={setSelectedPeriodId} disabled={periodStatus !== "ready"}>
            <SelectTrigger id="rendition-period"><SelectValue placeholder="Elegí un período" /></SelectTrigger>
            <SelectContent>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.label} · {period.agency}</SelectItem>)}</SelectContent>
          </Select>
          {periodAvailabilityMessage ? <div className="mt-2 flex flex-col items-start gap-2"><FieldDescription>{periodAvailabilityMessage}</FieldDescription>{periodStatus === "empty" && canCreatePeriods ? <Button asChild variant="outline" size="sm"><Link href="#periodos">Ir a Períodos y solicitudes</Link></Button> : null}{periodStatus === "empty" && !canCreatePeriods ? <FieldDescription>Pedile a Presidencia o Secretaría que cargue un período.</FieldDescription> : null}</div> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="rendition-sheet">Planilla emitida</FieldLabel>
          <Select value={selectedSheet?.id ?? ""} onValueChange={setSelectedSheetId} disabled={!selectedPeriod?.beneficiarySheets.length}>
            <SelectTrigger id="rendition-sheet"><SelectValue placeholder="Seleccioná una planilla" /></SelectTrigger>
            <SelectContent>{selectedPeriod?.beneficiarySheets.map((sheet) => <SelectItem key={sheet.id} value={sheet.id}>Versión {sheet.version} · {sheet.beneficiaryCount} beneficiarios · {formatDate(sheet.createdAt)}</SelectItem>)}</SelectContent>
          </Select>
          {!selectedPeriod?.beneficiarySheets.length ? <FieldDescription>Este período todavía no tiene una planilla emitida. Generala desde Registro de beneficiarios.</FieldDescription> : null}
        </Field>
      </div>

      {selectedSheet ? <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/40 p-3 sm:flex-row sm:items-center">
        <p className="text-sm"><strong>Referencia vinculada:</strong> planilla versión {selectedSheet.version} · {selectedSheet.beneficiaryCount} beneficiarios · emitida el {formatDate(selectedSheet.createdAt)}.</p>
        <SheetDocumentLink sheetId={selectedSheet.id} offlineMode={offlineMode} preparedDocuments={preparedDocuments} />
      </div> : null}

      {canWrite && selectedSheet ? <form className="space-y-4 rounded-2xl border p-4" onSubmit={(event) => void submitDocuments(event)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rendition-document-type">Tipo de documento</FieldLabel>
            <Select name="documentType" value={selectedType} onValueChange={onTypeChange}>
              <SelectTrigger id="rendition-document-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={RENDITION_DOCUMENT_TYPES.SIGNED_SHEET}>{RENDITION_DOCUMENT_LABELS.PLANILLA_FIRMADA}</SelectItem>
                <SelectItem value={RENDITION_DOCUMENT_TYPES.REMITTANCE}>{RENDITION_DOCUMENT_LABELS.REMITO}</SelectItem>
                <SelectItem value={RENDITION_DOCUMENT_TYPES.SUPPORTING}>{RENDITION_DOCUMENT_LABELS.RESPALDO}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="rendition-replacement">Corregir documento anterior (opcional)</FieldLabel>
            <Select value={selectedReplacementId || "none"} onValueChange={(value) => setSelectedReplacementId(value === "none" ? "" : value)}>
              <SelectTrigger id="rendition-replacement"><SelectValue placeholder="Cargar una nueva versión" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Cargar como nueva versión</SelectItem>
                {currentDocuments.filter((document) => document.documentType === selectedType).map((document) => <SelectItem key={document.id} value={document.id}>Reemplazar {document.originalName} · v{document.version}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldDescription>La versión anterior se conserva y queda vinculada a la corrección.</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="rendition-documents">Archivos PDF</FieldLabel>
          <Input
            id="rendition-documents"
            name="documents"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            required
            onChange={(event) => setSelectedFileNames(Array.from(event.currentTarget.files ?? []).map((file) => file.name))}
          />
          <FieldDescription>PDF de varias páginas permitido · máximo 512 KiB por archivo y 5 archivos por carga. No se toman fotos ni se capturan firmas en pantalla.</FieldDescription>
          {selectedFileNames.length ? <p className="text-xs text-muted-foreground" aria-live="polite">Seleccionados: {selectedFileNames.join(", ")}</p> : null}
        </Field>
        {actionMessage ? <Alert variant="destructive"><AlertTitle>No se confirmó la carga</AlertTitle><AlertDescription>{actionMessage}</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{isOnline ? "Al guardar, el servidor volverá a validar y conservar el archivo." : "Se guarda localmente con esta cuenta hasta recuperar conexión."}</p>
          <Button type="submit" disabled={isUploading}><HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} data-icon="inline-start" />{isUploading ? "Subiendo…" : "Guardar documentos"}</Button>
        </div>
      </form> : null}

      {currentDocuments.length || queuedUploads.length ? <section aria-label="Documentación recibida" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Archivos de esta planilla</h3><Badge variant="secondary">{currentDocuments.length} confirmados · {pendingDocumentCount} pendientes</Badge></div>
        <ul className="space-y-2">
          {visibleDocuments.map((document) => {
            const replaced = visibleDocuments.some((candidate) => candidate.supersedesId === document.id);
            const preparedDocument = preparedDocuments.find((candidate) => candidate.id === document.id);
            return <li key={document.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-words text-sm font-medium">{RENDITION_DOCUMENT_LABELS[document.documentType]} · {document.originalName}</p><p className="text-xs text-muted-foreground">Versión {document.version} · {formatFileSize(document.byteSize)} · {formatDate(document.createdAt)}{replaced ? " · Reemplazada, historial conservado" : " · Guardado en servidor"}</p></div></div>
              <div className="flex flex-wrap gap-2">
                <RenditionDocumentActions documentId={document.id} preparedDocument={preparedDocument} offlineMode={offlineMode} />
              </div>
            </li>;
          })}
          {queuedUploads.flatMap(({ operation, payload }) => payload.documents.map((document) => <li key={`${operation.operationId}-${document.id}`} className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3"><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-warning" /><div className="min-w-0"><p className="break-words text-sm font-medium">{RENDITION_DOCUMENT_LABELS[document.type]} · {document.originalName}</p><p className="text-xs text-muted-foreground">{operationLabel(operation.status)}{operation.message ? ` · ${operation.message}` : " · Todavía no se guardó en el servidor."}</p></div></div>
            {operation.status === "error" ? <Button size="sm" variant="outline" onClick={() => void retryOfflineOperation(userId, operation.operationId).then(async () => { await Promise.all([refreshQueue(), onRefresh()]); })}>Reintentar carga</Button> : <Badge variant="secondary">{operation.status === "syncing" ? "Subiendo" : "Pendiente offline"}</Badge>}
          </li>))}
        </ul>
      </section> : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Todavía no se guardaron documentos para esta planilla. La falta de un PDF se muestra como documentación pendiente.</p>}

      {canReview && selectedRendition ? <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
        <div className="flex items-start gap-3"><HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="font-semibold">Revisión documental manual</h3><p className="mt-1 text-sm text-muted-foreground">La app no verifica firmas ni validez ante el organismo. Revisar registra una actuación manual y no presenta ni cierra la rendición.</p>{selectedRendition.reviewNotes ? <p className="mt-2 text-sm">Observación: {selectedRendition.reviewNotes}</p> : null}</div></div>
        <form className="space-y-3" onSubmit={(event) => void saveReview(event, selectedRendition.id)}>
          <Field>
            <FieldLabel htmlFor="rendition-review-status">Resultado de revisión</FieldLabel>
            <Select value={reviewStatus} onValueChange={(value) => {
              const parsedStatus = z.enum(["REVISADA", "OBSERVADA"]).safeParse(value);
              if (parsedStatus.success) setReviewStatus(parsedStatus.data);
            }}>
              <SelectTrigger id="rendition-review-status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="REVISADA">Revisada manualmente</SelectItem><SelectItem value="OBSERVADA">Solicitar corrección</SelectItem></SelectContent>
            </Select>
          </Field>
          {reviewStatus === "OBSERVADA" ? <Field><FieldLabel htmlFor="rendition-review-notes">Qué debe corregirse *</FieldLabel><Textarea id="rendition-review-notes" value={reviewNotes} onChange={(event) => setReviewNotes(event.currentTarget.value)} maxLength={1000} rows={3} required /></Field> : null}
          {reviewMessage ? <p role={reviewMessage.includes("pendiente") ? "status" : "alert"} className="text-sm text-muted-foreground">{reviewMessage}</p> : null}
          {queuedReview ? <Alert variant={queuedReview.operation.status === "error" || queuedReview.operation.status === "conflict" ? "destructive" : "info"}><AlertTitle>{queuedReview.operation.status === "error" || queuedReview.operation.status === "conflict" ? "La revisión necesita atención" : "Revisión pendiente de validación"}</AlertTitle><AlertDescription>{queuedReview.operation.message ?? "El servidor confirmará la revisión cuando valide la sesión, el permiso y la planilla firmada."}</AlertDescription></Alert> : null}
          {queuedReview && (queuedReview.operation.status === "error" || queuedReview.operation.status === "conflict") ? <Button type="button" size="sm" variant="outline" onClick={() => {
            let retry: Promise<void>;
            if (queuedReview.operation.status === "error") {
              retry = retryOfflineOperation(userId, queuedReview.operation.operationId);
            } else {
              retry = updateOfflineOperationPayload(userId, queuedReview.operation.operationId, queuedReview.operation.payload)
                .then(() => synchronizeOfflineQueue(userId));
            }
            void retry.then(async () => {
              await Promise.all([refreshQueue(), onRefresh()]);
            }).catch((error: unknown) => setReviewMessage(errorMessage(error)));
          }}>Reintentar validación</Button> : null}
          <Button type="submit" size="sm" variant="outline" disabled={!hasSignedSheet || pendingDocumentCount > 0 || Boolean(queuedReview)}>{queuedReview ? "Revisión pendiente" : "Registrar revisión manual"}</Button>
          {!hasSignedSheet ? <p className="text-xs text-muted-foreground">La revisión se habilita después de guardar una planilla firmada en el servidor.</p> : null}
          {pendingDocumentCount > 0 ? <p className="text-xs text-muted-foreground">Sincronizá primero los documentos que todavía están en este dispositivo.</p> : null}
          {!isOnline && hasSignedSheet && pendingDocumentCount === 0 ? <p className="text-xs text-muted-foreground">La intención queda en esta cuenta y no se confirma oficialmente hasta que el servidor vuelva a validar el acceso.</p> : null}
        </form>
      </div> : null}
    </CardContent>
  </Card>;
}
