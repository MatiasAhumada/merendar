"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { API_ROUTES } from "@/constants/routes.constant";
import { MERCHANDISE_UI_TEXT } from "@/constants/merchandise.constant";
import { merchandiseRequestDocumentPayloadSchema, merchandiseRequestDocumentTemplateSchema } from "@/schemas/merchandise-request-document.schema";
import type { MerchandisePeriodRecord, MerchandiseRequestRecord } from "@/interfaces/merchandise.interface";
import type { MerchandiseRequestDocumentKind, MerchandiseRequestDocumentRecord, MerchandiseRequestDocumentTemplate } from "@/interfaces/merchandise-request-document.interface";
import { createMerchandiseRequestPdf } from "@/services/merchandise-request-document-pdf.service";
import { enqueueOfflineOperation } from "@/services/offline-queue.service";
import { readOfflinePreparedDocuments, saveOfflinePreparedDocument, removeOfflinePreparedDocument, type OfflinePreparedDocument } from "@/services/offline-preparation.service";
import { jsonValueSchema } from "@/schemas/offline.schema";
import { listOfflineOperations } from "@/services/offline-queue.service";
import type { OfflineOperation } from "@/types/offline-operation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon } from "@hugeicons/core-free-icons";
import clientAxios from "@/utils/clientAxios.util";

const emptyTemplate = {
  associationName: "",
  resolution: "",
  address: "",
  contact: "",
  recipient: "",
  recipientTitle: "",
  locality: "",
  issueDate: new Date().toLocaleDateString("sv-SE"),
  requestedPeriod: "",
  purpose: "",
  population: "",
  observations: "",
  signatories: [{ name: "", title: "" }, { name: "", title: "" }],
  logoDataUrl: "",
} satisfies MerchandiseRequestDocumentTemplate;

interface MerchandiseRequestDocumentComposerProps {
  request: MerchandiseRequestRecord;
  period: MerchandisePeriodRecord;
  userId: string;
  sessionExpiresAt: string;
  isOnline: boolean;
}

function fileToDataUrl(file: File) {
  return file.arrayBuffer().then((arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 1) {
      binary += String.fromCharCode(bytes[offset] ?? 0);
    }
    return `data:${file.type};base64,${btoa(binary)}`;
  });
}

function downloadPdf(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([asArrayBuffer(bytes)], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "No se pudo completar el borrador.";
}

function asArrayBuffer(bytes: Uint8Array) {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

function templateFromForm(form: HTMLFormElement, logoDataUrl: string, request: MerchandiseRequestRecord, period: MerchandisePeriodRecord) {
  const data = new FormData(form);
  const template = merchandiseRequestDocumentTemplateSchema.parse({
    associationName: data.get("associationName"),
    resolution: data.get("resolution"),
    address: data.get("address"),
    contact: data.get("contact"),
    recipient: data.get("recipient"),
    recipientTitle: data.get("recipientTitle"),
    locality: data.get("locality"),
    issueDate: data.get("issueDate"),
    requestedPeriod: data.get("requestedPeriod"),
    purpose: data.get("purpose"),
    population: data.get("population"),
    observations: data.get("observations"),
    signatories: [
      { name: data.get("signatoryName"), title: data.get("signatoryTitle") },
      { name: data.get("secondSignatoryName"), title: data.get("secondSignatoryTitle") },
    ].filter((signatory) => Boolean(signatory.name) || Boolean(signatory.title)),
    logoDataUrl,
  });
  const items: Array<{ productName: string; presentation: string; unit: string; requestedQuantity: number }> = [];
  if (request.item) {
    items.push({ productName: request.item.productName, presentation: request.item.presentation, unit: request.item.unit, requestedQuantity: request.item.requestedQuantity });
  }
  let kind: MerchandiseRequestDocumentKind = "MODULES";
  if (period.destination === "MERENDERO") {
    kind = "MERENDERO_SUPPLIES";
  }
  return {
    kind,
    template,
    request: {
      requestNumber: request.requestNumber,
      requestedAt: request.requestedAt,
      requestedQuantity: request.requestedQuantity,
      period: { label: period.label, agency: period.agency },
      items,
    },
  };
}

export function MerchandiseRequestDocumentComposer({ request, period, userId, sessionExpiresAt, isOnline }: MerchandiseRequestDocumentComposerProps) {
  let documentKind: MerchandiseRequestDocumentKind = "MODULES";
  if (period.destination === "MERENDERO") {
    documentKind = "MERENDERO_SUPPLIES";
  }
  const previousSnapshot = request.issuedDocuments.filter((document) => document.kind === documentKind).sort((left, right) => right.version - left.version)[0]?.snapshot;
  const [open, setOpen] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState(previousSnapshot?.template.logoDataUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [savedDocuments, setSavedDocuments] = useState<MerchandiseRequestDocumentRecord[]>(request.issuedDocuments.filter((document) => document.kind === documentKind));
  const [offlineDocuments, setOfflineDocuments] = useState<OfflinePreparedDocument[]>([]);
  const [queuedDocuments, setQueuedDocuments] = useState<OfflineOperation[]>([]);

  useEffect(() => {
    void Promise.all([readOfflinePreparedDocuments(userId), listOfflineOperations(userId)]).then(([documents, operations]) => {
      setOfflineDocuments(documents.filter((document) => document.documentType === "merchandise-request"));
      setQueuedDocuments(operations.filter((operation) => {
        const payload = merchandiseRequestDocumentPayloadSchema.safeParse(operation.payload);
        return payload.success && payload.data.requestId === request.id;
      }));
    }).catch(() => undefined);
  }, [request.id, userId]);

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  async function chooseLogo(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!new Set(["image/png", "image/jpeg"]).has(file.type) || file.size > 256 * 1024) {
      throw new Error("Usá el logo institucional aprobado en PNG o JPG, de hasta 256 KiB.");
    }
    setLogoDataUrl(await fileToDataUrl(file));
  }

  async function previewDocument(form: HTMLFormElement) {
    const documentInput = templateFromForm(form, logoDataUrl, request, period);
    const bytes = await createMerchandiseRequestPdf(documentInput);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(new Blob([asArrayBuffer(bytes)], { type: "application/pdf" })));
    setMessage("");
  }

  async function emitDocument(form: HTMLFormElement) {
    const documentId = crypto.randomUUID();
    const documentInput = templateFromForm(form, logoDataUrl, request, period);
    const payload = merchandiseRequestDocumentPayloadSchema.parse({
      kind: "request-document",
      id: documentId,
      requestId: request.id,
      documentKind,
      template: documentInput.template,
    });
    const pdfBytes = await createMerchandiseRequestPdf(documentInput);
    let fileSuffix = "insumos-merendero";
    if (documentKind === "MODULES") {
      fileSuffix = "modulos";
    }
    const localName = `borrador-solicitud-${fileSuffix}-${request.requestNumber}.pdf`;

    if (isOnline) {
      await clientAxios.post(API_ROUTES.MERCHANDISE_REQUEST_DOCUMENTS(request.id), payload);
      const response = await clientAxios.get<ArrayBuffer>(API_ROUTES.MERCHANDISE_DOCUMENT(documentId), { responseType: "arraybuffer" });
      downloadPdf(new Uint8Array(response.data), localName);
      const issuedDocument: MerchandiseRequestDocumentRecord = {
        id: documentId,
        kind: documentKind,
        version: (savedDocuments[0]?.version ?? 0) + 1,
        templateVersion: 1,
        originalName: localName,
        contentType: "application/pdf",
        createdAt: new Date().toISOString(),
        snapshot: documentInput,
      };
      setSavedDocuments((documents) => [issuedDocument, ...documents]);
      return;
    }

    await saveOfflinePreparedDocument(userId, {
      id: documentId,
      originalName: localName,
      contentType: "application/pdf",
      byteSize: pdfBytes.byteLength,
      content: new Blob([asArrayBuffer(pdfBytes)], { type: "application/pdf" }),
      documentType: "merchandise-request",
    });
    try {
      const operation = await enqueueOfflineOperation(userId, sessionExpiresAt, {
        resource: "remittances",
        resourceId: documentId,
        operation: "create",
        baseVersion: null,
        dependencies: [],
        payload: jsonValueSchema.parse(JSON.parse(JSON.stringify(payload))),
      });
      setQueuedDocuments((operations) => [...operations, operation]);
      setOfflineDocuments((documents) => [...documents, { id: documentId, originalName: localName, contentType: "application/pdf", byteSize: pdfBytes.byteLength, content: new Blob([asArrayBuffer(pdfBytes)], { type: "application/pdf" }), documentType: "merchandise-request" }]);
    } catch (error) {
      await removeOfflinePreparedDocument(userId, documentId);
      throw error;
    }
    downloadPdf(pdfBytes, localName);
    setMessage("Borrador guardado en este dispositivo. La emisión queda pendiente de validación del servidor al recuperar conexión.");
  }

  async function handleIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) {
      return;
    }
    setWorking(true);
    setMessage("");
    try {
      await emitDocument(event.currentTarget);
      if (isOnline) {
        setMessage("Borrador emitido y descargado. No acredita presentación ni aprobación del organismo.");
      }
    } catch (error) {
      setMessage(readErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  let defaultPurpose = "Solicitamos los insumos detallados para las actividades del merendero.";
  if (documentKind === "MODULES") {
    defaultPurpose = "Solicitamos módulos alimentarios para su distribución a las familias destinatarias de la asociación.";
  }
  const previousTemplate = previousSnapshot?.template;
  const template = { ...emptyTemplate, ...previousTemplate, requestedPeriod: previousTemplate?.requestedPeriod || period.label, purpose: previousTemplate?.purpose || defaultPurpose, observations: previousTemplate?.observations || request.notes || "" };
  let documentTitle = "Solicitud de insumos";
  if (documentKind === "MODULES") {
    documentTitle = "Solicitud de módulos";
  }
  let formMessage: ReactNode = null;
  if (message) {
    let alertVariant: "info" | "destructive" = "destructive";
    let alertTitle = "No se pudo completar";
    if (message.startsWith("Borrador")) {
      alertVariant = "info";
      alertTitle = "Documento";
    }
    formMessage = <Alert variant={alertVariant}><AlertTitle>{alertTitle}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>;
  }
  let populationField: ReactNode = null;
  if (documentKind === "MODULES") {
    populationField = <Field><FieldLabel htmlFor={`request-population-${request.id}`}>Población de referencia</FieldLabel><Input id={`request-population-${request.id}`} name="population" defaultValue={template.population} maxLength={240} /></Field>;
  }
  let previewFrame: ReactNode = null;
  if (previewUrl) {
    previewFrame = <div className="space-y-2"><h3 className="text-sm font-semibold">Vista previa</h3><iframe title="Vista previa del borrador de solicitud" src={previewUrl} className="h-[50dvh] min-h-72 w-full rounded-lg border" /></div>;
  }
  let submitLabel = "Guardar borrador local";
  if (isOnline) {
    submitLabel = "Emitir borrador y descargar";
  }
  if (working) {
    submitLabel = "Generando…";
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="outline" size="sm">{MERCHANDISE_UI_TEXT.GENERAR_BORRADOR_PDF}</Button></DialogTrigger>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-2rem)]">
      <DialogHeader className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-wrap items-center gap-2"><DialogTitle>{documentTitle}</DialogTitle><Badge variant="warning">Borrador</Badge></div>
        <DialogDescription>Los datos del pedido vienen de {request.requestNumber}. Completá los datos institucionales vigentes y revisá el PDF antes de emitirlo.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void handleIssue(event)} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">
        <FieldGroup className="gap-4 pt-4">
          <Alert variant="info"><AlertTitle>Plantilla pendiente de aprobación</AlertTitle><AlertDescription>El PDF queda marcado como borrador y no declara que fue presentado o aprobado. No se agrega sello ni numeración oficial.</AlertDescription></Alert>
          <Field><FieldLabel htmlFor={`association-logo-${request.id}`}>Logo institucional aprobado *</FieldLabel><Input id={`association-logo-${request.id}`} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" required={!logoDataUrl} onChange={(event) => void chooseLogo(event.currentTarget.files?.[0]).catch((error: unknown) => setMessage(readErrorMessage(error)))} /><FieldDescription>PNG o JPG, hasta 256 KiB. No se usa el logo de la aplicación.</FieldDescription></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={`association-name-${request.id}`}>Asociación *</FieldLabel><Input id={`association-name-${request.id}`} name="associationName" defaultValue={template.associationName} maxLength={160} required /></Field>
            <Field><FieldLabel htmlFor={`association-resolution-${request.id}`}>Resolución</FieldLabel><Input id={`association-resolution-${request.id}`} name="resolution" defaultValue={template.resolution} maxLength={120} /></Field>
            <Field><FieldLabel htmlFor={`association-address-${request.id}`}>Domicilio</FieldLabel><Input id={`association-address-${request.id}`} name="address" defaultValue={template.address} maxLength={200} /></Field>
            <Field><FieldLabel htmlFor={`association-contact-${request.id}`}>Contacto</FieldLabel><Input id={`association-contact-${request.id}`} name="contact" defaultValue={template.contact} maxLength={160} /></Field>
            <Field><FieldLabel htmlFor={`request-recipient-${request.id}`}>Organismo / destinatario *</FieldLabel><Input id={`request-recipient-${request.id}`} name="recipient" defaultValue={template.recipient || period.agency} maxLength={160} required /></Field>
            <Field><FieldLabel htmlFor={`request-recipient-title-${request.id}`}>Cargo del destinatario</FieldLabel><Input id={`request-recipient-title-${request.id}`} name="recipientTitle" defaultValue={template.recipientTitle} maxLength={160} /></Field>
            <Field><FieldLabel htmlFor={`request-locality-${request.id}`}>Localidad de emisión *</FieldLabel><Input id={`request-locality-${request.id}`} name="locality" defaultValue={template.locality} maxLength={120} required /></Field>
            <Field><FieldLabel htmlFor={`request-issue-date-${request.id}`}>Fecha de emisión *</FieldLabel><Input id={`request-issue-date-${request.id}`} name="issueDate" type="date" defaultValue={template.issueDate} required /></Field>
            <Field><FieldLabel htmlFor={`request-period-${request.id}`}>Período solicitado *</FieldLabel><Input id={`request-period-${request.id}`} name="requestedPeriod" defaultValue={template.requestedPeriod} maxLength={120} required /></Field>
            {populationField}
          </div>
          <Field><FieldLabel htmlFor={`request-purpose-${request.id}`}>Destino y texto del pedido *</FieldLabel><Textarea id={`request-purpose-${request.id}`} name="purpose" defaultValue={template.purpose} maxLength={1000} rows={4} required /></Field>
          <Field><FieldLabel htmlFor={`request-observations-${request.id}`}>Observaciones</FieldLabel><Textarea id={`request-observations-${request.id}`} name="observations" defaultValue={template.observations} maxLength={1000} rows={3} /></Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={`request-signatory-name-${request.id}`}>Responsable / firmante *</FieldLabel><Input id={`request-signatory-name-${request.id}`} name="signatoryName" defaultValue={template.signatories[0]?.name ?? ""} maxLength={120} required /></Field>
            <Field><FieldLabel htmlFor={`request-signatory-title-${request.id}`}>Cargo *</FieldLabel><Input id={`request-signatory-title-${request.id}`} name="signatoryTitle" defaultValue={template.signatories[0]?.title ?? ""} maxLength={120} required /></Field>
            <Field><FieldLabel htmlFor={`request-second-signatory-name-${request.id}`}>Segundo responsable</FieldLabel><Input id={`request-second-signatory-name-${request.id}`} name="secondSignatoryName" defaultValue={template.signatories[1]?.name ?? ""} maxLength={120} /></Field>
            <Field><FieldLabel htmlFor={`request-second-signatory-title-${request.id}`}>Segundo cargo</FieldLabel><Input id={`request-second-signatory-title-${request.id}`} name="secondSignatoryTitle" defaultValue={template.signatories[1]?.title ?? ""} maxLength={120} /></Field>
          </div>
          {formMessage}
          {previewFrame}
          {savedDocuments.map((document) => <a key={document.id} href={API_ROUTES.MERCHANDISE_DOCUMENT(document.id)} className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"><HugeiconsIcon icon={File01Icon} />{document.originalName} · versión {document.version}</a>)}
          {queuedDocuments.map((operation) => {
            const payload = merchandiseRequestDocumentPayloadSchema.safeParse(operation.payload);
            if (!payload.success) {
              return null;
            }
            const localDocument = offlineDocuments.find((document) => document.id === payload.data.id);
            if (!localDocument) {
              return null;
            }
            let badgeVariant: "success" | "warning" = "warning";
            let badgeLabel = "Pendiente de sincronización";
            if (operation.status === "synced") {
              badgeVariant = "success";
              badgeLabel = "Sincronizado";
            }
            return <div key={operation.operationId} className="flex flex-wrap items-center gap-2 text-sm"><Button type="button" size="sm" variant="outline" onClick={() => void localDocument.content.arrayBuffer().then((bytes) => downloadPdf(new Uint8Array(bytes), localDocument.originalName))}>Abrir borrador local</Button><Badge variant={badgeVariant}>{badgeLabel}</Badge></div>;
          })}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={working} onClick={(event) => {
              const form = event.currentTarget.form;
              if (form && form.reportValidity()) void previewDocument(form).catch((error: unknown) => setMessage(readErrorMessage(error)));
            }}>Vista previa</Button>
            <Button type="submit" disabled={working}>{submitLabel}</Button>
          </div>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}
