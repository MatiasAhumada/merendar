import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { RenditionEmissionSource } from "@/server/repository/rendition-emission.repository";
import type { RenditionEmissionSnapshot, RenditionEmissionTemplate } from "@/interfaces/rendition.interface";
import { RENDITION_UI_TEXT } from "@/constants/rendition.constant";
import { HTTP_CONTENT_TYPES } from "@/constants/http.constant";
import { beneficiaryCountSchema } from "@/schemas/synchronization.schema";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 48;
const TEXT_COLOR = rgb(0.12, 0.17, 0.16);

interface PdfWriter {
  document: PDFDocument;
  regularFont: PDFFont;
  boldFont: PDFFont;
  page: PDFPage;
  y: number;
}

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(date));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(value);
}

function wrapLine(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let currentLine = "";

  for (const word of value.split(/\s+/)) {
    let candidate = word;
    if (currentLine) {
      candidate = `${currentLine} ${word}`;
    }

    if (font.widthOfTextAtSize(candidate, size) > width && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

async function createWriter(title: string) {
  const document = await PDFDocument.create();
  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const writer: PdfWriter = {
    document,
    regularFont,
    boldFont,
    page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - PAGE_MARGIN,
  };
  writeBlock(writer, RENDITION_UI_TEXT.BORRADOR_INTERNO.toUpperCase(), 9, boldFont);
  writeBlock(writer, title, 16, boldFont, 12);
  return writer;
}

function addPage(writer: PdfWriter, title: string) {
  writer.page = writer.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  writer.y = PAGE_HEIGHT - PAGE_MARGIN;
  writeBlock(writer, `${title} · CONTINUACIÓN`, 9, writer.boldFont, 16);
}

function writeBlock(writer: PdfWriter, value: string, size = 10, font = writer.regularFont, gap = 5) {
  const availableWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const lines = wrapLine(value, font, size, availableWidth);

  for (const line of lines) {
    if (writer.y < PAGE_MARGIN + size + 8) {
      addPage(writer, RENDITION_UI_TEXT.EMISION_DOCUMENTAL);
    }
    writer.page.drawText(line, { x: PAGE_MARGIN, y: writer.y, size, font, color: TEXT_COLOR });
    writer.y -= size + gap;
  }
}

function emissionSnapshot(source: RenditionEmissionSource, template: RenditionEmissionTemplate): RenditionEmissionSnapshot {
  const event = source.beneficiarySheet.distributionEvent;
  const deliveries = event?.familyDeliveries ?? [];
  const registeredModuleQuantity = deliveries.reduce((total, delivery) => total + delivery.moduleQuantity, 0);
  const familyCount = new Set(deliveries.map((delivery) => delivery.family.id)).size;
  const participants = deliveries.flatMap((delivery) => delivery.participants.map((participant) => ({
    family: delivery.family.name,
    person: `${participant.familyMember.person.lastName}, ${participant.familyMember.person.firstName}`,
    paperSignatureChecked: participant.paperSignatureChecked,
    physicalDniChecked: participant.physicalDniChecked,
    dniPresent: Boolean(participant.familyMember.person.dni),
    missingDocumentTypes: participant.familyMember.missingDocuments.map((document) => document.documentType),
  })));
  const requests = source.period.requests.map((request) => {
    const activeRemittances = request.remittances.filter((remittance) => remittance.status === "VIGENTE");
    const receivedQuantity = activeRemittances.reduce((total, remittance) => total + remittance.receivedQuantity.toNumber(), 0);
    const approvedQuantity = request.quota?.approvedQuantity.toNumber() ?? 0;
    const requestItem = request.items[0];
    return {
      requestNumber: request.requestNumber,
      requestedQuantity: request.requestedQuantity.toNumber(),
      approvedQuantity,
      receivedQuantity,
      unit: requestItem?.unit ?? "módulos",
      productName: requestItem?.productName ?? "módulos familiares",
      status: request.status,
      remittances: activeRemittances.map((remittance) => ({ number: remittance.remittanceNumber, quantity: remittance.receivedQuantity.toNumber(), receivedAt: remittance.receivedAt.toISOString() })),
      orderReference: request.quota?.externalOrderNumber ?? null,
      notes: request.notes,
    };
  });
  const missingItems: string[] = [];
  if (registeredModuleQuantity !== familyCount) {
    missingItems.push(`Cantidad de módulos registrada (${registeredModuleQuantity}) distinta de un módulo por familia (${familyCount})`);
  }
  const renditionDocuments = source.documents.map((document) => ({
    id: document.id,
    type: document.documentType,
    version: document.version,
    name: document.originalName,
    createdAt: document.createdAt.toISOString(),
    current: !document.supersededBy.length,
  }));
  const merchandiseAttachments = source.period.requests.flatMap((request) => [
    ...request.documents.filter((document) => document.contentType === HTTP_CONTENT_TYPES.PDF).map((document) => ({ id: document.id, type: "COMPROBANTE", version: 1, name: document.originalName, createdAt: document.createdAt.toISOString(), current: true })),
    ...request.issuedDocuments.filter((document) => document.contentType === HTTP_CONTENT_TYPES.PDF).map((document) => ({ id: document.id, type: "DOCUMENTO_DE_SOLICITUD", version: document.version, name: document.originalName, createdAt: document.createdAt.toISOString(), current: true })),
    ...request.remittances.flatMap((remittance) => remittance.documents.filter((document) => document.contentType === HTTP_CONTENT_TYPES.PDF).map((document) => ({ id: document.id, type: "COMPROBANTE_DE_RECEPCION", version: 1, name: document.originalName, createdAt: document.createdAt.toISOString(), current: true }))),
  ]);
  const activeDocuments = renditionDocuments.filter((document) => document.current);
  const parsedBeneficiaries = beneficiaryCountSchema.safeParse(source.beneficiarySheet.snapshot);

  if (!activeDocuments.some((document) => document.type === "PLANILLA_FIRMADA")) {
    missingItems.push("Planilla firmada vigente");
  }
  for (const request of requests) {
    if (!request.orderReference) {
      missingItems.push(`Solicitud ${request.requestNumber}: falta referencia de orden externa`);
    }
    if (!request.remittances.length) {
      missingItems.push(`Solicitud ${request.requestNumber}: no hay recepción documentada`);
    }
  }
  for (const participant of participants) {
    if (!participant.paperSignatureChecked) {
      missingItems.push(`${participant.family}: firma manuscrita pendiente de cotejo`);
    }
    if (!participant.physicalDniChecked) {
      missingItems.push(`${participant.family}: DNI pendiente de cotejo`);
    }
    if (!participant.dniPresent) {
      missingItems.push(`${participant.family}: falta DNI en el padrón`);
    }
    for (const documentType of participant.missingDocumentTypes) {
      missingItems.push(`${participant.family}: falta documentación ${documentType}`);
    }
  }

  let beneficiaryCount = 0;
  if (parsedBeneficiaries.success) {
    beneficiaryCount = parsedBeneficiaries.data.beneficiaries.length;
  }
  let eventSnapshot: { scheduledAt: string; location: string; responsibleNames: string } | null = null;
  if (event) {
    eventSnapshot = { scheduledAt: event.scheduledAt.toISOString(), location: event.location, responsibleNames: event.responsibleNames };
  }

  return {
    template,
    period: { id: source.period.id, label: source.period.label, agency: source.period.agency, startsAt: source.period.startsAt.toISOString(), endsAt: source.period.endsAt.toISOString(), destination: source.period.destination },
    sheet: { id: source.beneficiarySheet.id, version: source.beneficiarySheet.version, beneficiaryCount },
    event: eventSnapshot,
    deliveredModules: familyCount,
    registeredModuleQuantity,
    familyCount,
    participants,
    requests,
    cycles: source.period.cycles.map((cycle) => ({ externalOrderReference: cycle.externalOrderReference, authorizedRecipient: cycle.authorizedRecipient, authorizationValidUntil: cycle.authorizationValidUntil?.toISOString() ?? null, notes: cycle.notes })),
    documents: [...renditionDocuments, ...merchandiseAttachments],
    missingItems: [...new Set(missingItems)],
    reviewStatus: source.reviewStatus,
    reviewNotes: source.reviewNotes,
    generatedAt: new Date().toISOString(),
  };
}

async function createNotePdf(snapshot: RenditionEmissionSnapshot) {
  const writer = await createWriter("Nota de rendición");
  const { template, period } = snapshot;
  writeBlock(writer, template.associationName, 12, writer.boldFont);
  if (template.associationResolution) writeBlock(writer, `Resolución: ${template.associationResolution}`, 9);
  if (template.associationAddress) writeBlock(writer, `Domicilio: ${template.associationAddress}`, 9);
  if (template.associationPhone) writeBlock(writer, `Teléfono: ${template.associationPhone}`, 9);
  if (template.associationEmail) writeBlock(writer, `Correo: ${template.associationEmail}`, 9);
  writeBlock(writer, `${template.locality}, ${formatDate(template.issueDate)}`, 10, writer.regularFont, 12);
  writeBlock(writer, `A: ${template.recipient}`, 11, writer.boldFont);
  if (template.recipientTitle) writeBlock(writer, template.recipientTitle, 10, writer.regularFont, 12);
  writeBlock(writer, `Asunto: Rendición de mercadería · ${period.label}`, 11, writer.boldFont, 12);
  writeBlock(writer, `Período informado: ${period.label} (${formatDate(period.startsAt)} al ${formatDate(period.endsAt)}). Organismo: ${period.agency}.`, 10);
  writeBlock(writer, `La documentación adjunta resume los registros del ciclo. Se registran ${formatNumber(snapshot.deliveredModules)} módulos entregados a ${snapshot.familyCount} familias. Las personas que constan en las planillas se presentan como detalle de cada retiro y no incrementan el total de módulos.`, 10, writer.regularFont, 9);
  writeBlock(writer, "Documento generado como borrador interno. La plantilla y su uso ante el organismo requieren aprobación. La generación no acredita presentación ni aceptación oficial.", 9, writer.boldFont, 12);
  if (template.observations) {
    writeBlock(writer, `Observaciones: ${template.observations}`, 10, writer.regularFont, 10);
  }
  writeBlock(writer, "Atentamente,", 10, writer.regularFont, 24);

  for (const signatory of template.signatories) {
    writeBlock(writer, "________________________________________", 10, writer.regularFont, 3);
    writeBlock(writer, signatory.name, 10, writer.boldFont, 2);
    writeBlock(writer, signatory.title, 9, writer.regularFont, 12);
  }

  return new Uint8Array(await writer.document.save());
}

async function createSummaryPdf(snapshot: RenditionEmissionSnapshot) {
  const writer = await createWriter("Resumen conciliado del ciclo");
  writeBlock(writer, `Período: ${snapshot.period.label} · ${snapshot.period.agency}`, 11, writer.boldFont);
  let destinationLabel = "Insumos del merendero";
  if (snapshot.period.destination === "FAMILIES") {
    destinationLabel = "Módulos para familias";
  }
  writeBlock(writer, `Destino: ${destinationLabel}`);
  writeBlock(writer, `Planilla versión ${snapshot.sheet.version} · ${snapshot.sheet.beneficiaryCount} personas en la instantánea`);
  if (snapshot.event) {
    writeBlock(writer, `Jornada: ${formatDate(snapshot.event.scheduledAt)} · ${snapshot.event.location} · responsables: ${snapshot.event.responsibleNames}`);
  } else {
    writeBlock(writer, "No hay una jornada de distribución enlazada a la planilla.");
  }
  writeBlock(writer, `Entrega conciliada según un módulo por familia: ${snapshot.deliveredModules} módulos · ${snapshot.familyCount} familias · cantidad de módulos informada: ${snapshot.registeredModuleQuantity} · ${snapshot.participants.length} personas/firmantes`, 10, writer.boldFont, 10);
  writeBlock(writer, "PEDIDOS, CUPOS Y RECEPCIÓN", 11, writer.boldFont, 6);

  if (!snapshot.requests.length) {
    writeBlock(writer, "No se encontraron solicitudes de mercadería para este período.");
  }
  for (const request of snapshot.requests) {
    writeBlock(writer, `Solicitud ${request.requestNumber} · ${request.status} · ${request.productName} · solicitado ${formatNumber(request.requestedQuantity)} ${request.unit} · cupo ${formatNumber(request.approvedQuantity)} ${request.unit} · recibido ${formatNumber(request.receivedQuantity)} ${request.unit}`, 9);
    writeBlock(writer, `Saldo frente al cupo: ${formatNumber(request.approvedQuantity - request.receivedQuantity)} ${request.unit} · orden externa: ${request.orderReference ?? "sin referencia"}`, 9, writer.regularFont, 8);
    if (request.notes) {
      writeBlock(writer, `Observación de la solicitud: ${request.notes}`, 9);
    }
  }
  for (const cycle of snapshot.cycles) {
    let cycleDetails = `Ciclo documental · destinatario autorizado: ${cycle.authorizedRecipient ?? "sin dato"} · orden externa: ${cycle.externalOrderReference ?? "sin referencia"}`;
    if (cycle.authorizationValidUntil) {
      cycleDetails = `${cycleDetails} · vigencia indicada: ${formatDate(cycle.authorizationValidUntil)}`;
    }
    if (cycle.notes) {
      cycleDetails = `${cycleDetails} · observaciones: ${cycle.notes}`;
    }
    writeBlock(writer, cycleDetails, 9);
  }
  writeBlock(writer, "FAMILIAS Y PERSONAS REGISTRADAS EN EL RETIRO", 11, writer.boldFont, 6);
  if (!snapshot.participants.length) {
    writeBlock(writer, "No se encontraron participantes vinculados a la jornada.");
  }
  for (const participant of snapshot.participants) {
    let details = `${participant.family} · ${participant.person}`;
    if (!participant.paperSignatureChecked) details += " · firma pendiente de cotejo";
    if (!participant.physicalDniChecked) details += " · DNI pendiente de cotejo";
    if (!participant.dniPresent) details += " · DNI ausente del padrón";
    if (participant.missingDocumentTypes.length) details += ` · documentación faltante: ${participant.missingDocumentTypes.join(", ")}`;
    writeBlock(writer, details, 9);
  }
  writeBlock(writer, "DOCUMENTACIÓN Y FALTANTES", 11, writer.boldFont, 6);
  for (const document of snapshot.documents) {
    let status = "vigente";
    if (!document.current) {
      status = "versión reemplazada, conservada en el expediente";
    }
    writeBlock(writer, `${document.type} v${document.version} · ${document.name} · ${status} · registro ${document.id}`, 9);
  }
  if (!snapshot.documents.length) writeBlock(writer, "No hay documentos adjuntos a la rendición.");
  if (!snapshot.missingItems.length) writeBlock(writer, "No se detectaron faltantes en los datos conciliados.");
  for (const missingItem of snapshot.missingItems) writeBlock(writer, `Pendiente: ${missingItem}`, 9);
  let reviewDescription = `Revisión manual registrada: ${snapshot.reviewStatus}`;
  if (snapshot.reviewNotes) {
    reviewDescription = `${reviewDescription} · ${snapshot.reviewNotes}`;
  }
  writeBlock(writer, reviewDescription, 9, writer.regularFont, 8);
  writeBlock(writer, "Los archivos fuente se conservan íntegros y disponibles en sus registros originales. Este paquete reúne copias de consulta.", 8);
  return new Uint8Array(await writer.document.save());
}

async function createPackagePdf(notePdf: Uint8Array, summaryPdf: Uint8Array, source: RenditionEmissionSource) {
  const packageDocument = await PDFDocument.create();
  const merchandiseAttachments = source.period.requests.flatMap((request) => [
    ...request.documents.filter((document) => document.contentType === HTTP_CONTENT_TYPES.PDF).map((document) => ({ name: document.originalName, content: new Uint8Array(document.content) })),
    ...request.issuedDocuments.filter((document) => document.contentType === HTTP_CONTENT_TYPES.PDF).map((document) => ({ name: document.originalName, content: new Uint8Array(document.content) })),
    ...request.remittances.flatMap((remittance) => remittance.documents.filter((document) => document.contentType === HTTP_CONTENT_TYPES.PDF).map((document) => ({ name: document.originalName, content: new Uint8Array(document.content) }))),
  ]);
  const appendedDocuments = source.documents.map((document) => ({ name: document.originalName, content: new Uint8Array(document.content) }));
  const unavailableDocuments: string[] = [];

  for (const sourceBytes of [notePdf, summaryPdf]) {
    const sourceDocument = await PDFDocument.load(sourceBytes);
    const pages = await packageDocument.copyPages(sourceDocument, sourceDocument.getPageIndices());
    for (const page of pages) packageDocument.addPage(page);
  }

  for (const attachment of [...appendedDocuments, ...merchandiseAttachments]) {
    try {
      const sourceDocument = await PDFDocument.load(attachment.content);
      const pages = await packageDocument.copyPages(sourceDocument, sourceDocument.getPageIndices());
      for (const page of pages) packageDocument.addPage(page);
    } catch {
      unavailableDocuments.push(attachment.name);
    }
  }

  if (unavailableDocuments.length) {
    const warningWriter = await createWriter("Archivos originales que no se pudieron abrir");
    writeBlock(warningWriter, "Estos archivos se conservan íntegros en sus registros originales, pero no se pudieron incorporar como páginas en este paquete:", 10, warningWriter.boldFont, 10);
    for (const documentName of unavailableDocuments) {
      writeBlock(warningWriter, documentName, 9);
    }
    const warningPdf = await PDFDocument.load(await warningWriter.document.save());
    const warningPages = await packageDocument.copyPages(warningPdf, warningPdf.getPageIndices());
    for (const page of warningPages) packageDocument.addPage(page);
  }

  return new Uint8Array(await packageDocument.save());
}

export async function createRenditionEmissionPdfs(source: RenditionEmissionSource, template: RenditionEmissionTemplate) {
  const snapshot = emissionSnapshot(source, template);
  const notePdf = await createNotePdf(snapshot);
  const summaryPdf = await createSummaryPdf(snapshot);
  const packagePdf = await createPackagePdf(notePdf, summaryPdf, source);
  return { snapshot, notePdf, summaryPdf, packagePdf };
}
