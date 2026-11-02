import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { MerchandisePeriodRecord } from "@/interfaces/merchandise.interface";
import type { RenditionEmissionTemplate } from "@/interfaces/rendition.interface";
import type { OfflinePreparedDocument } from "@/services/offline-preparation.service";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 48;
const TEXT_COLOR = rgb(0.12, 0.17, 0.16);
const WARNING_COLOR = rgb(0.58, 0.2, 0.05);

interface OfflinePdfWriter {
  document: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  y: number;
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let line = "";

  for (const word of value.split(/\s+/)) {
    let candidate = word;
    if (line) {
      candidate = `${line} ${word}`;
    }
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) {
    lines.push(line);
  }
  return lines;
}

function writeText(writer: OfflinePdfWriter, value: string, size = 10, bold = false, color = TEXT_COLOR) {
  let font = writer.font;
  if (bold) {
    font = writer.boldFont;
  }
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;

  for (const line of wrapText(value, font, size, maxWidth)) {
    if (writer.y < PAGE_MARGIN + size + 8) {
      writer.page = writer.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      writer.y = PAGE_HEIGHT - PAGE_MARGIN;
      writer.page.drawText("BORRADOR OFFLINE · PENDIENTE DE SINCRONIZACIÓN", {
        x: PAGE_MARGIN,
        y: writer.y,
        size: 9,
        font: writer.boldFont,
        color: WARNING_COLOR,
      });
      writer.y -= 24;
    }

    writer.page.drawText(line, { x: PAGE_MARGIN, y: writer.y, size, font, color });
    writer.y -= size + 5;
  }
}

function createWriter(document: PDFDocument, font: PDFFont, boldFont: PDFFont): OfflinePdfWriter {
  const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  return { document, page, font, boldFont, y: PAGE_HEIGHT - PAGE_MARGIN };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

async function appendOriginalDocuments(
  packageDocument: PDFDocument,
  sourceDocumentIds: string[],
  preparedDocuments: OfflinePreparedDocument[],
  pendingDocuments: Array<{ id: string; originalName: string; contentBase64: string }>,
) {
  const preparedAttachments = sourceDocumentIds.flatMap((sourceDocumentId) => {
    const preparedDocument = preparedDocuments.find((document) => document.id === sourceDocumentId);
    if (!preparedDocument) {
      return [];
    }
    return [preparedDocument];
  });

  for (const attachment of preparedAttachments) {
    try {
      const source = await PDFDocument.load(await attachment.content.arrayBuffer());
      const pages = await packageDocument.copyPages(source, source.getPageIndices());
      for (const page of pages) {
        packageDocument.addPage(page);
      }
    } catch {
      // Keep a broken scan in its original local record and show its ID in the draft index.
    }
  }

  for (const sourceDocumentId of sourceDocumentIds) {
    const pendingDocument = pendingDocuments.find((document) => document.id === sourceDocumentId);
    if (!pendingDocument) {
      continue;
    }
    const binary = atob(pendingDocument.contentBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    try {
      const source = await PDFDocument.load(bytes);
      const pages = await packageDocument.copyPages(source, source.getPageIndices());
      for (const page of pages) {
        packageDocument.addPage(page);
      }
    } catch {
      // Keep the queued source untouched and identify it in the local package index.
    }
  }
}

export async function createOfflineRenditionPackage(input: {
  period: MerchandisePeriodRecord;
  sheet: { id: string; version: number; beneficiaryCount: number };
  renditionId: string;
  template: RenditionEmissionTemplate;
  sourceDocumentIds: string[];
  preparedDocuments: OfflinePreparedDocument[];
  pendingDocuments?: Array<{ id: string; originalName: string; contentBase64: string }>;
}) {
  const packageDocument = await PDFDocument.create();
  const font = await packageDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await packageDocument.embedFont(StandardFonts.HelveticaBold);
  const writer = createWriter(packageDocument, font, boldFont);
  const { period, sheet, template } = input;

  writeText(writer, "BORRADOR OFFLINE · PENDIENTE DE SINCRONIZACIÓN", 10, true, WARNING_COLOR);
  writeText(writer, "Nota de rendición · copia local", 16, true);
  writeText(writer, template.associationName, 12, true);
  if (template.associationResolution) writeText(writer, `Resolución: ${template.associationResolution}`);
  if (template.associationAddress) writeText(writer, `Domicilio: ${template.associationAddress}`);
  if (template.associationPhone) writeText(writer, `Teléfono: ${template.associationPhone}`);
  if (template.associationEmail) writeText(writer, `Correo: ${template.associationEmail}`);
  writeText(writer, `${template.locality}, ${formatDate(template.issueDate)}`);
  let recipient = `A: ${template.recipient}`;
  if (template.recipientTitle) {
    recipient += ` · ${template.recipientTitle}`;
  }
  writeText(writer, recipient, 11, true);
  writeText(writer, `Asunto: Rendición de mercadería · ${period.label}`, 11, true);
  writeText(writer, `Período: ${period.label} · ${formatDate(period.startsAt)} al ${formatDate(period.endsAt)} · Organismo: ${period.agency}`);
  writeText(writer, `Planilla emitida v${sheet.version} · ${sheet.beneficiaryCount} personas en la instantánea.`);
  writeText(writer, "Esta copia se generó con datos preparados en el dispositivo. El servidor volverá a conciliar cantidades, jornada, familias, personas y documentos al sincronizar. No presentar esta copia como rendición final.", 10, true, WARNING_COLOR);
  if (template.observations) writeText(writer, `Observaciones: ${template.observations}`);
  writeText(writer, "Atentamente,", 10, false);
  for (const signatory of template.signatories) {
    writeText(writer, "________________________________________");
    writeText(writer, signatory.name, 10, true);
    writeText(writer, signatory.title);
  }

  writer.page = packageDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  writer.y = PAGE_HEIGHT - PAGE_MARGIN;
  writeText(writer, "Resumen preliminar del ciclo", 16, true);
  let destination = "Insumos del merendero";
  if (period.destination === "FAMILIES") {
    destination = "Módulos para familias";
  }
  writeText(writer, `Destino: ${destination}`);
  writeText(writer, `Rendición ${input.renditionId} · período ${period.id} · planilla ${sheet.id} v${sheet.version}`);
  writeText(writer, "PEDIDOS, CUPOS Y RECEPCIÓN", 11, true);
  if (!period.requests.length) {
    writeText(writer, "No hay pedidos registrados para este período.");
  }
  for (const request of period.requests) {
    const received = request.remittances.filter((remittance) => remittance.status === "VIGENTE").reduce((total, remittance) => total + remittance.receivedQuantity, 0);
    const approved = request.quota?.approvedQuantity ?? 0;
    const unit = request.item?.unit ?? "unidades";
    writeText(writer, `Solicitud ${request.requestNumber} · solicitado ${formatNumber(request.requestedQuantity)} ${unit} · cupo ${formatNumber(approved)} ${unit} · recibido ${formatNumber(received)} ${unit} · saldo ${formatNumber(approved - received)} ${unit}`);
    writeText(writer, `Orden externa: ${request.quota?.externalOrderNumber ?? "sin referencia"} · remitos: ${request.remittances.filter((remittance) => remittance.status === "VIGENTE").map((remittance) => remittance.remittanceNumber).join(", ") || "sin recepción registrada"}`);
  }
  writeText(writer, "Módulos por familia, jornada y detalle de firmantes: pendientes de conciliación del servidor. Las personas de la planilla no se cuentan como módulos.", 10, true, WARNING_COLOR);
  writeText(writer, "DOCUMENTOS ORIGINALES REFERENCIADOS", 11, true);
  if (!input.sourceDocumentIds.length) writeText(writer, "No hay adjuntos originales registrados para esta versión.");
  for (const documentId of input.sourceDocumentIds) {
    const preparedDocument = input.preparedDocuments.find((document) => document.id === documentId);
    const name = preparedDocument?.originalName ?? "archivo no preparado en este dispositivo";
    let attachmentStatus = " · pendiente de recuperar al sincronizar";
    if (preparedDocument) {
      attachmentStatus = " · copia íntegra adjunta";
    }
    writeText(writer, `${name} · registro ${documentId}${attachmentStatus}`);
  }
  writeText(writer, "La aplicación conserva los originales en su almacenamiento asociado y no incorpora firmas en este borrador.");

  await appendOriginalDocuments(packageDocument, input.sourceDocumentIds, input.preparedDocuments, input.pendingDocuments ?? []);
  return new Uint8Array(await packageDocument.save());
}
