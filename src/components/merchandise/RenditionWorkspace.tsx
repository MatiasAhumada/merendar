"use client";

import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { COMMON_UI_TEXT } from "@/constants/common-ui.constant";
import { MERCHANDISE_UI_TEXT, MERCHANDISE_ERROR_MESSAGES } from "@/constants/merchandise.constant";
import { RENDITION_UI_TEXT, RENDITION_DOCUMENT_LABELS, RENDITION_DOCUMENT_TYPES, RENDITION_LIMITS } from "@/constants/rendition.constant";
import { APPLICATION_UI_TEXT } from "@/constants/application-ui.constant";
import { API_ROUTES } from "@/constants/routes.constant";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
import { synchronizeOfflineQueue, enqueueOfflineOperation, listOfflineOperations, retryOfflineOperation, updateOfflineOperationPayload } from "@/services/offline-queue.service";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { z } from "zod";
import Link from "next/link";

import type { MerchandisePeriodRecord } from "@/interfaces/merchandise.interface";
import type { OfflinePreparedDocument } from "@/services/offline-preparation.service";
import type { OfflineOperation } from "@/types/offline-operation";
import {
  renditionDocumentPayloadSchema,
  renditionReviewOperationPayloadSchema,
  renditionReviewPayloadSchema,
  type RenditionDocumentPayload,
} from "@/validations/rendition.validation";

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
  return COMMON_UI_TEXT.FILE_SIZE_IN_KIB(byteSize);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return MERCHANDISE_ERROR_MESSAGES.NO_SE_PUDO_GUARDAR_EL_DOCUMENTO;
}

async function encodePdf(file: File) {
  if (!file.size || file.size > RENDITION_LIMITS.MAX_DOCUMENT_BYTES) {
    throw new Error(MERCHANDISE_ERROR_MESSAGES.CADA_PDF_DEBE_PESAR_HASTA_512_KIB_Y_NO_PUEDE_ESTAR_VACIO);
  }

  if (file.type !== HTTP_CONTENT_TYPES.PDF || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(MERCHANDISE_ERROR_MESSAGES.ELEGI_UN_ARCHIVO_PDF_LAS_IMAGENES_NO_REEMPLAZAN_LA_PLANILLA_ESCANEADA);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  const footer = new TextDecoder("latin1").decode(bytes.slice(Math.max(0, bytes.length - 1024)));

  if (header !== "%PDF-" || !footer.includes("%%EOF")) {
    throw new Error(MERCHANDISE_ERROR_MESSAGES.EL_CONTENIDO_NO_PARECE_UN_PDF_COMPLETO_VOLVE_A_EXPORTARLO_Y_SELECCIONA);
  }

  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return { originalName: file.name, contentType: HTTP_CONTENT_TYPES.PDF, contentBase64: btoa(binary) };
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
    return MERCHANDISE_UI_TEXT.ERROR_DE_CARGA;
  }

  if (status === "syncing") {
    return MERCHANDISE_UI_TEXT.SUBIENDO;
  }

  return MERCHANDISE_UI_TEXT.PENDIENTE_OFFLINE;
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
      return <p className="text-xs text-muted-foreground">{RENDITION_UI_TEXT.LA_PLANILLA_NO_ESTA_GUARDADA_EN_ESTA_PREPARACION_OFFLINE}</p>;
    }
    return <PreparedRenditionDocumentLink document={preparedDocument} label={RENDITION_UI_TEXT.ABRIR_PLANILLA_PREPARADA} download />;
  }

  return <Button asChild size="sm" variant="outline"><a href={API_ROUTES.RECORD_SHEET(sheetId)}><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} data-icon="inline-start" /> {RENDITION_UI_TEXT.DESCARGAR_PARA_IMPRIMIR}</a></Button>;
}

function RenditionDocumentActions({ documentId, preparedDocument, offlineMode }: { documentId: string; preparedDocument: OfflinePreparedDocument | undefined; offlineMode: boolean }) {
  if (offlineMode) {
    if (!preparedDocument) {
      return <Badge variant="warning">{RENDITION_UI_TEXT.PDF_NO_PREPARADO}</Badge>;
    }
    return <><PreparedRenditionDocumentLink document={preparedDocument} label={RENDITION_UI_TEXT.PREVISUALIZAR} /><PreparedRenditionDocumentLink document={preparedDocument} label={RENDITION_UI_TEXT.DESCARGAR} download /></>;
  }

  return <><Button asChild size="sm" variant="outline"><a href={API_ROUTES.RENDITION_DOCUMENT_PREVIEW(documentId)} target="_blank" rel="noreferrer">{RENDITION_UI_TEXT.PREVISUALIZAR}</a></Button><Button asChild size="sm" variant="secondary"><a href={API_ROUTES.RENDITION_DOCUMENT(documentId)}>{RENDITION_UI_TEXT.DESCARGAR}</a></Button></>;
}

function reviewLabel(status: "PENDIENTE" | "REVISADA" | "OBSERVADA") {
  if (status === "REVISADA") {
    return MERCHANDISE_UI_TEXT.REVISADA_MANUALMENTE;
  }

  if (status === "OBSERVADA") {
    return MERCHANDISE_UI_TEXT.REQUIERE_CORRECCION;
  }

  return MERCHANDISE_UI_TEXT.PENDIENTE_DE_REVISION;
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
    periodAvailabilityMessage = MERCHANDISE_UI_TEXT.NO_SE_PUDO_CONFIRMAR_SI_HAY_PERIODOS_REINTENTA_LA_CARGA_ANTES_DE_SELECCION;
  } else if (periodStatus === "offline-unprepared") {
    periodAvailabilityMessage = MERCHANDISE_UI_TEXT.NO_HAY_PERIODOS_PREPARADOS_EN_ESTA_VISTA_SIN_CONEXION;
  } else if (periodStatus === "empty") {
    periodAvailabilityMessage = MERCHANDISE_UI_TEXT.NO_HAY_PERIODOS_CARGADOS;
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
        throw new Error(MERCHANDISE_ERROR_MESSAGES.SELECCIONA_UN_PERIODO_Y_UNA_PLANILLA_EMITIDA_ANTES_DE_ADJUNTAR_DOCUMEN);
      }

      const files = form.getAll("documents").filter((entry): entry is File => entry instanceof File && entry.size > 0);

      if (!files.length || files.length > RENDITION_LIMITS.MAX_DOCUMENTS_PER_UPLOAD) {
        throw new Error(MERCHANDISE_ERROR_MESSAGES.SELECCIONA_ENTRE_1_Y_5_ARCHIVOS_PDF_POR_CARGA);
      }

      if (files.length > 1 && selectedReplacementId) {
        throw new Error(MERCHANDISE_ERROR_MESSAGES.PARA_CORREGIR_UNA_VERSION_ANTERIOR_SELECCIONA_UN_SOLO_ARCHIVO_PDF);
      }

      const selectedBytes = files.reduce((total, file) => total + file.size, 0);

      if (selectedBytes > RENDITION_LIMITS.MAX_UPLOAD_BYTES) {
        throw new Error(MERCHANDISE_ERROR_MESSAGES.LA_SELECCION_COMPLETA_NO_PUEDE_SUPERAR_700_KIB_POR_CARGA);
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
        throw new Error(parsedPayload.error.issues[0]?.message ?? MERCHANDISE_ERROR_MESSAGES.LA_SELECCION_SUPERA_EL_LIMITE_PERMITIDO);
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
      setReviewMessage(parsedReview.error.issues[0]?.message ?? MERCHANDISE_UI_TEXT.REVISA_LOS_DATOS_DE_REVISION);
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
      let savedReviewMessage: string = MERCHANDISE_ERROR_MESSAGES.REVISION_PENDIENTE_EN_ESTE_DISPOSITIVO_SE_CONFIRMARA_CUANDO_EL_SERVIDOR_VA;
      if (isOnline) {
        savedReviewMessage = MERCHANDISE_UI_TEXT.REVISION_GUARDADA_Y_ENVIADA_PARA_VALIDACION_DEL_SERVIDOR;
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
          <CardTitle id="renditions-title" className="font-display text-xl">{RENDITION_UI_TEXT.RENDICION_DOCUMENTAL}</CardTitle>
          <CardDescription>{RENDITION_UI_TEXT.VINCULA_LOS_PDF_ESCANEADOS_CON_LA_PLANILLA_EMITIDA_Y_EL_PERIODO_CORRESPO}</CardDescription>
        </div>
        {selectedRendition ? <Badge variant={selectedRendition.reviewStatus === "REVISADA" ? "success" : selectedRendition.reviewStatus === "OBSERVADA" ? "warning" : "secondary"}>{reviewLabel(selectedRendition.reviewStatus)}</Badge> : null}
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      {!isOnline ? <Alert variant="info"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} /><AlertTitle>{RENDITION_UI_TEXT.LA_CARGA_QUEDA_PENDIENTE_EN_ESTE_DISPOSITIVO}</AlertTitle><AlertDescription>{RENDITION_UI_TEXT.EL_PDF_SE_CONSERVA_ASOCIADO_A_ESTA_CUENTA_Y_A_LA_PLANILLA_ELEGIDA_NO_SE}</AlertDescription></Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="rendition-period">{RENDITION_UI_TEXT.MODULO_O_PERIODO}</FieldLabel>
          <Select value={selectedPeriod?.id ?? ""} onValueChange={setSelectedPeriodId} disabled={periodStatus !== "ready"}>
            <SelectTrigger id="rendition-period"><SelectValue placeholder={RENDITION_UI_TEXT.ELEGI_UN_PERIODO} /></SelectTrigger>
            <SelectContent>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{period.label} {APPLICATION_UI_TEXT.TEXT}{period.agency}</SelectItem>)}</SelectContent>
          </Select>
          {periodAvailabilityMessage ? <div className="mt-2 flex flex-col items-start gap-2"><FieldDescription>{periodAvailabilityMessage}</FieldDescription>{periodStatus === "empty" && canCreatePeriods ? <Button asChild variant="outline" size="sm"><Link href="#periodos">{RENDITION_UI_TEXT.IR_A_PERIODOS_Y_SOLICITUDES}</Link></Button> : null}{periodStatus === "empty" && !canCreatePeriods ? <FieldDescription>{APPLICATION_UI_TEXT.PEDILE_A_PRESIDENCIA_O_SECRETARIA_QUE_CARGUE_UN_PERIODO}</FieldDescription> : null}</div> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="rendition-sheet">{RENDITION_UI_TEXT.PLANILLA_EMITIDA}</FieldLabel>
          <Select value={selectedSheet?.id ?? ""} onValueChange={setSelectedSheetId} disabled={!selectedPeriod?.beneficiarySheets.length}>
            <SelectTrigger id="rendition-sheet"><SelectValue placeholder={RENDITION_UI_TEXT.SELECCIONA_UNA_PLANILLA} /></SelectTrigger>
            <SelectContent>{selectedPeriod?.beneficiarySheets.map((sheet) => <SelectItem key={sheet.id} value={sheet.id}>{APPLICATION_UI_TEXT.VERSION}{sheet.version} {APPLICATION_UI_TEXT.TEXT}{sheet.beneficiaryCount} {RENDITION_UI_TEXT.BENEFICIARIOS}{formatDate(sheet.createdAt)}</SelectItem>)}</SelectContent>
          </Select>
          {!selectedPeriod?.beneficiarySheets.length ? <FieldDescription>{RENDITION_UI_TEXT.ESTE_PERIODO_TODAVIA_NO_TIENE_UNA_PLANILLA_EMITIDA_GENERALA_DESDE_REGIST}</FieldDescription> : null}
        </Field>
      </div>

      {selectedSheet ? <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/40 p-3 sm:flex-row sm:items-center">
        <p className="text-sm"><strong>{RENDITION_UI_TEXT.REFERENCIA_VINCULADA}</strong> {RENDITION_UI_TEXT.PLANILLA_VERSION}{selectedSheet.version} {APPLICATION_UI_TEXT.TEXT}{selectedSheet.beneficiaryCount} {RENDITION_UI_TEXT.BENEFICIARIOS_EMITIDA_EL}{formatDate(selectedSheet.createdAt)}{RENDITION_UI_TEXT.TEXT}</p>
        <SheetDocumentLink sheetId={selectedSheet.id} offlineMode={offlineMode} preparedDocuments={preparedDocuments} />
      </div> : null}

      {canWrite && selectedSheet ? <form className="space-y-4 rounded-2xl border p-4" onSubmit={(event) => void submitDocuments(event)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rendition-document-type">{RENDITION_UI_TEXT.TIPO_DE_DOCUMENTO}</FieldLabel>
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
            <FieldLabel htmlFor="rendition-replacement">{RENDITION_UI_TEXT.CORREGIR_DOCUMENTO_ANTERIOR_OPCIONAL}</FieldLabel>
            <Select value={selectedReplacementId || "none"} onValueChange={(value) => setSelectedReplacementId(value === "none" ? "" : value)}>
              <SelectTrigger id="rendition-replacement"><SelectValue placeholder={RENDITION_UI_TEXT.CARGAR_UNA_NUEVA_VERSION} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{RENDITION_UI_TEXT.CARGAR_COMO_NUEVA_VERSION}</SelectItem>
                {currentDocuments.filter((document) => document.documentType === selectedType).map((document) => <SelectItem key={document.id} value={document.id}>{RENDITION_UI_TEXT.REEMPLAZAR}{document.originalName} {RENDITION_UI_TEXT.V}{document.version}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldDescription>{RENDITION_UI_TEXT.LA_VERSION_ANTERIOR_SE_CONSERVA_Y_QUEDA_VINCULADA_A_LA_CORRECCION}</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="rendition-documents">{RENDITION_UI_TEXT.ARCHIVOS_PDF}</FieldLabel>
          <Input
            id="rendition-documents"
            name="documents"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            required
            onChange={(event) => setSelectedFileNames(Array.from(event.currentTarget.files ?? []).map((file) => file.name))}
          />
          <FieldDescription>{RENDITION_UI_TEXT.PDF_DE_VARIAS_PAGINAS_PERMITIDO_MAXIMO_512_KIB_POR_ARCHIVO_Y_5_ARCHIVOS}</FieldDescription>
          {selectedFileNames.length ? <p className="text-xs text-muted-foreground" aria-live="polite">{RENDITION_UI_TEXT.SELECCIONADOS}{selectedFileNames.join(", ")}</p> : null}
        </Field>
        {actionMessage ? <Alert variant="destructive"><AlertTitle>{RENDITION_UI_TEXT.NO_SE_CONFIRMO_LA_CARGA}</AlertTitle><AlertDescription>{actionMessage}</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{isOnline ? MERCHANDISE_UI_TEXT.AL_GUARDAR_EL_SERVIDOR_VOLVERA_A_VALIDAR_Y_CONSERVAR_EL_ARCHIVO : MERCHANDISE_UI_TEXT.SE_GUARDA_LOCALMENTE_CON_ESTA_CUENTA_HASTA_RECUPERAR_CONEXION}</p>
          <Button type="submit" disabled={isUploading}><HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} data-icon="inline-start" />{isUploading ? MERCHANDISE_UI_TEXT.SUBIENDO : MERCHANDISE_UI_TEXT.GUARDAR_DOCUMENTOS}</Button>
        </div>
      </form> : null}

      {currentDocuments.length || queuedUploads.length ? <section aria-label={RENDITION_UI_TEXT.DOCUMENTACION_RECIBIDA} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{RENDITION_UI_TEXT.ARCHIVOS_DE_ESTA_PLANILLA}</h3><Badge variant="secondary">{currentDocuments.length} {RENDITION_UI_TEXT.CONFIRMADOS}{pendingDocumentCount} {RENDITION_UI_TEXT.PENDIENTES}</Badge></div>
        <ul className="space-y-2">
          {visibleDocuments.map((document) => {
            const replaced = visibleDocuments.some((candidate) => candidate.supersedesId === document.id);
            const preparedDocument = preparedDocuments.find((candidate) => candidate.id === document.id);
            return <li key={document.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3"><HugeiconsIcon icon={File01Icon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="break-words text-sm font-medium">{RENDITION_DOCUMENT_LABELS[document.documentType]} {APPLICATION_UI_TEXT.TEXT}{document.originalName}</p><p className="text-xs text-muted-foreground">{APPLICATION_UI_TEXT.VERSION}{document.version} {APPLICATION_UI_TEXT.TEXT}{formatFileSize(document.byteSize)} {APPLICATION_UI_TEXT.TEXT}{formatDate(document.createdAt)}{replaced ? MERCHANDISE_UI_TEXT.REEMPLAZADA_HISTORIAL_CONSERVADO : MERCHANDISE_UI_TEXT.GUARDADO_EN_SERVIDOR}</p></div></div>
              <div className="flex flex-wrap gap-2">
                <RenditionDocumentActions documentId={document.id} preparedDocument={preparedDocument} offlineMode={offlineMode} />
              </div>
            </li>;
          })}
          {queuedUploads.flatMap(({ operation, payload }) => payload.documents.map((document) => <li key={`${operation.operationId}-${document.id}`} className="flex flex-col gap-2 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3"><HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-warning" /><div className="min-w-0"><p className="break-words text-sm font-medium">{RENDITION_DOCUMENT_LABELS[document.type]} {APPLICATION_UI_TEXT.TEXT}{document.originalName}</p><p className="text-xs text-muted-foreground">{operationLabel(operation.status)}{operation.message ? `${APPLICATION_UI_TEXT.TEXT}${operation.message}` : MERCHANDISE_UI_TEXT.TODAVIA_NO_SE_GUARDO_EN_EL_SERVIDOR}</p></div></div>
            {operation.status === "error" ? <Button size="sm" variant="outline" onClick={() => void retryOfflineOperation(userId, operation.operationId).then(async () => { await Promise.all([refreshQueue(), onRefresh()]); })}>{RENDITION_UI_TEXT.REINTENTAR_CARGA}</Button> : <Badge variant="secondary">{operation.status === "syncing" ? MERCHANDISE_UI_TEXT.UPLOADING_STATUS : MERCHANDISE_UI_TEXT.PENDIENTE_OFFLINE}</Badge>}
          </li>))}
        </ul>
      </section> : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{RENDITION_UI_TEXT.TODAVIA_NO_SE_GUARDARON_DOCUMENTOS_PARA_ESTA_PLANILLA_LA_FALTA_DE_UN_PDF}</p>}

      {canReview && selectedRendition ? <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
        <div className="flex items-start gap-3"><HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={1.8} className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="font-semibold">{RENDITION_UI_TEXT.REVISION_DOCUMENTAL_MANUAL}</h3><p className="mt-1 text-sm text-muted-foreground">{RENDITION_UI_TEXT.LA_APP_NO_VERIFICA_FIRMAS_NI_VALIDEZ_ANTE_EL_ORGANISMO_REVISAR_REGISTRA}</p>{selectedRendition.reviewNotes ? <p className="mt-2 text-sm">{RENDITION_UI_TEXT.OBSERVACION}{selectedRendition.reviewNotes}</p> : null}</div></div>
        <form className="space-y-3" onSubmit={(event) => void saveReview(event, selectedRendition.id)}>
          <Field>
            <FieldLabel htmlFor="rendition-review-status">{RENDITION_UI_TEXT.RESULTADO_DE_REVISION}</FieldLabel>
            <Select value={reviewStatus} onValueChange={(value) => {
              const parsedStatus = z.enum(["REVISADA", "OBSERVADA"]).safeParse(value);
              if (parsedStatus.success) setReviewStatus(parsedStatus.data);
            }}>
              <SelectTrigger id="rendition-review-status"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="REVISADA">{RENDITION_UI_TEXT.REVISADA_MANUALMENTE}</SelectItem><SelectItem value="OBSERVADA">{RENDITION_UI_TEXT.SOLICITAR_CORRECCION}</SelectItem></SelectContent>
            </Select>
          </Field>
          {reviewStatus === "OBSERVADA" ? <Field><FieldLabel htmlFor="rendition-review-notes">{RENDITION_UI_TEXT.QUE_DEBE_CORREGIRSE}</FieldLabel><Textarea id="rendition-review-notes" value={reviewNotes} onChange={(event) => setReviewNotes(event.currentTarget.value)} maxLength={1000} rows={3} required /></Field> : null}
          {reviewMessage ? <p role={reviewMessage.includes("pendiente") ? "status" : "alert"} className="text-sm text-muted-foreground">{reviewMessage}</p> : null}
          {queuedReview ? <Alert variant={queuedReview.operation.status === "error" || queuedReview.operation.status === "conflict" ? "destructive" : "info"}><AlertTitle>{queuedReview.operation.status === "error" || queuedReview.operation.status === "conflict" ? MERCHANDISE_UI_TEXT.LA_REVISION_NECESITA_ATENCION : MERCHANDISE_UI_TEXT.REVISION_PENDIENTE_DE_VALIDACION}</AlertTitle><AlertDescription>{queuedReview.operation.message ?? MERCHANDISE_UI_TEXT.EL_SERVIDOR_CONFIRMARA_LA_REVISION_CUANDO_VALIDE_LA_SESION_EL_PERMISO_Y_LA}</AlertDescription></Alert> : null}
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
          }}>{RENDITION_UI_TEXT.REINTENTAR_VALIDACION}</Button> : null}
          <Button type="submit" size="sm" variant="outline" disabled={!hasSignedSheet || pendingDocumentCount > 0 || Boolean(queuedReview)}>{queuedReview ? MERCHANDISE_UI_TEXT.REVISION_PENDIENTE : MERCHANDISE_UI_TEXT.REGISTRAR_REVISION_MANUAL}</Button>
          {!hasSignedSheet ? <p className="text-xs text-muted-foreground">{RENDITION_UI_TEXT.LA_REVISION_SE_HABILITA_DESPUES_DE_GUARDAR_UNA_PLANILLA_FIRMADA_EN_EL_SE}</p> : null}
          {pendingDocumentCount > 0 ? <p className="text-xs text-muted-foreground">{RENDITION_UI_TEXT.SINCRONIZA_PRIMERO_LOS_DOCUMENTOS_QUE_TODAVIA_ESTAN_EN_ESTE_DISPOSITIVO}</p> : null}
          {!isOnline && hasSignedSheet && pendingDocumentCount === 0 ? <p className="text-xs text-muted-foreground">{RENDITION_UI_TEXT.LA_INTENCION_QUEDA_EN_ESTA_CUENTA_Y_NO_SE_CONFIRMA_OFICIALMENTE_HASTA_QU}</p> : null}
        </form>
      </div> : null}
    </CardContent>
  </Card>;
}
