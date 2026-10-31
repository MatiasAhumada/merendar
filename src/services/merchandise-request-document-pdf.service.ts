import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { merchandiseRequestDocumentTemplateSchema } from "@/schemas/merchandise-request-document.schema";
import type { MerchandiseRequestDocumentKind, MerchandiseRequestDocumentTemplate } from "@/interfaces/merchandise-request-document.interface";

export interface RequestDocumentSource {
  requestNumber: string;
  requestedAt: Date | string;
  requestedQuantity: number;
  period: { label: string; agency: string };
  items: Array<{ productName: string; presentation: string; unit: string; requestedQuantity: number }>;
}

function wrapText(value: string, font: PDFFont, fontSize: number, width: number) {
  const lines: string[] = [];
  let line = "";

  for (const word of value.split(/\s+/)) {
    let candidate = word;
    if (line) {
      candidate = `${line} ${word}`;
    }
    if (font.widthOfTextAtSize(candidate, fontSize) > width && line) {
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

export async function createMerchandiseRequestPdf(input: {
  kind: MerchandiseRequestDocumentKind;
  template: MerchandiseRequestDocumentTemplate;
  request: RequestDocumentSource;
}) {
  const parsedTemplate = merchandiseRequestDocumentTemplateSchema.parse(input.template);
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logoPayload = parsedTemplate.logoDataUrl.split(",")[1];
  const logoBytes = Uint8Array.from(atob(logoPayload), (character) => character.charCodeAt(0));
  let logo = null;
  if (parsedTemplate.logoDataUrl.startsWith("data:image/png")) {
    logo = await document.embedPng(logoBytes);
  } else {
    logo = await document.embedJpg(logoBytes);
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 54;
  const textWidth = pageWidth - margin * 2;
  const ink = rgb(0.12, 0.17, 0.16);
  let page = document.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function newPage() {
    page = document.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    return page;
  }

  function writeBlock(value: string, fontSize = 11, font = regular, gap = 5) {
    const lines = wrapText(value, font, fontSize, textWidth);
    for (const line of lines) {
      if (y < margin + 68) {
        newPage();
      }
      page.drawText(line, { x: margin, y, size: fontSize, font, color: ink });
      y -= fontSize + gap;
    }
  }

  const logoSize = logo.scaleToFit(110, 62);
  page.drawImage(logo, { x: margin, y: y - logoSize.height, ...logoSize });
  page.drawText("BORRADOR · PARA REVISIÓN", { x: pageWidth - margin - 190, y: y - 10, size: 9, font: bold, color: rgb(0.55, 0.28, 0.08) });
  y -= Math.max(logoSize.height, 24) + 22;
  writeBlock(parsedTemplate.associationName, 13, bold, 3);
  if (parsedTemplate.resolution) writeBlock(parsedTemplate.resolution, 9, regular, 2);
  if (parsedTemplate.address) writeBlock(parsedTemplate.address, 9, regular, 2);
  if (parsedTemplate.contact) writeBlock(parsedTemplate.contact, 9, regular, 2);
  y -= 14;
  writeBlock(`${parsedTemplate.locality}, ${parsedTemplate.issueDate}`, 11, regular, 9);
  writeBlock(`A: ${parsedTemplate.recipient}`, 11, bold, 3);
  if (parsedTemplate.recipientTitle) writeBlock(parsedTemplate.recipientTitle, 10, regular, 9);
  let subject = "Solicitud de insumos para merendero";
  if (input.kind === "MODULES") {
    subject = "Solicitud de módulos para familias";
  }
  writeBlock(`Asunto: ${subject}`, 11, bold, 12);
  writeBlock(parsedTemplate.purpose, 11, regular, 7);
  y -= 6;
  writeBlock(`Solicitud ${input.request.requestNumber} · Período de mercadería: ${input.request.period.label}`, 10, bold, 5);
  writeBlock(`Organismo: ${input.request.period.agency} · Período solicitado: ${parsedTemplate.requestedPeriod}`, 10);
  if (input.kind === "MODULES") {
    writeBlock(`Destino: Familias · Cantidad solicitada: ${input.request.requestedQuantity} módulos`, 10);
    if (parsedTemplate.population) writeBlock(`Población de referencia: ${parsedTemplate.population}`, 10);
  } else {
    for (const item of input.request.items) {
      writeBlock(`Producto requerido: ${item.productName} · Presentación: ${item.presentation} · Cantidad: ${item.requestedQuantity} ${item.unit}`, 10);
    }
  }
  if (parsedTemplate.observations) writeBlock(`Observaciones: ${parsedTemplate.observations}`, 10);
  y -= 20;
  writeBlock("Sin otro particular, saludamos atentamente.", 11, regular, 24);

  for (const signatory of parsedTemplate.signatories) {
    if (y < margin + 92) {
      newPage();
    }
    page.drawLine({ start: { x: margin, y: y - 10 }, end: { x: margin + 190, y: y - 10 }, thickness: 0.7, color: ink });
    y -= 25;
    writeBlock(signatory.name, 10, bold, 2);
    writeBlock(signatory.title, 9, regular, 14);
  }

  for (const printablePage of document.getPages()) {
    printablePage.drawText("Borrador de solicitud. No acredita presentación ni aprobación del organismo destinatario.", {
      x: margin,
      y: 26,
      size: 7,
      font: regular,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  return new Uint8Array(await document.save());
}
