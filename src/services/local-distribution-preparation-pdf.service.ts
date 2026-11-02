import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { DELIVERY_REPORT_TEXT } from "@/constants/delivery.constant";
import type { DistributionPreparationPayload, RecordsCollection } from "@/types/schema-contracts";

export type DistributionReportPayload = DistributionPreparationPayload & { periodLabel: string; agency: string };

function wrapText(value: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    let candidate = word;
    if (line) {
      candidate = `${line} ${word}`;
    }
    if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && line) {
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

function formatModuleQuantity(quantity: number) {
  if (quantity === 1) {
    return "1 módulo";
  }
  return `${quantity} módulos`;
}

export async function createDistributionPreparationPdf(payload: DistributionReportPayload, data: RecordsCollection) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const textColor = rgb(0.12, 0.17, 0.15);
  const mutedColor = rgb(0.38, 0.43, 0.4);
  const familyAllocations = payload.allocations.map((allocation) => {
    const family = data.families.find((entry) => entry.id === allocation.familyId);
    const remittance = data.moduleReceipts.find((entry) => entry.id === allocation.remittanceId);
    return { destination: `${DELIVERY_REPORT_TEXT.FAMILY}: ${family?.name ?? DELIVERY_REPORT_TEXT.FAMILY_UNAVAILABLE}`, source: `${remittance?.requestNumber ?? DELIVERY_REPORT_TEXT.SOURCE_UNAVAILABLE} / ${remittance?.remittanceNumber ?? DELIVERY_REPORT_TEXT.SOURCE_UNAVAILABLE}`, quantity: formatModuleQuantity(allocation.moduleQuantity), notes: allocation.notes ?? "" };
  });
  const supplyAllocations = payload.supplyAllocations.map((allocation) => {
    const receipt = data.supplyReceipts.find((entry) => entry.id === allocation.receiptItemId);
    return { destination: `${DELIVERY_REPORT_TEXT.MERENDERO_SUPPLIES}: ${receipt?.productName ?? DELIVERY_REPORT_TEXT.SOURCE_UNAVAILABLE} ${receipt?.presentation ?? ""}`, source: `${receipt?.requestNumber ?? DELIVERY_REPORT_TEXT.SOURCE_UNAVAILABLE} / ${receipt?.remittanceNumber ?? DELIVERY_REPORT_TEXT.SOURCE_UNAVAILABLE}`, quantity: `${allocation.quantity} ${receipt?.unit ?? ""}`.trim(), notes: allocation.notes ?? "" };
  });
  const rows = [...familyAllocations, ...supplyAllocations];
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  let page = pdf.addPage([pageWidth, pageHeight]);
  pages.push(page);
  let cursor = pageHeight - 48;

  function drawWrapped(value: string, x: number, width: number, font: PDFFont, size: number, color = textColor, lineHeight = size + 4) {
    const lines = wrapText(value, font, size, width);
    for (const line of lines) {
      if (cursor < 55) {
        page = pdf.addPage([pageWidth, pageHeight]);
        pages.push(page);
        cursor = pageHeight - 48;
      }
      page.drawText(line, { x, y: cursor, size, font, color });
      cursor -= lineHeight;
    }
    return lines.length;
  }

  drawWrapped(DELIVERY_REPORT_TEXT.TITLE, margin, pageWidth - margin * 2, boldFont, 16, rgb(0.08, 0.29, 0.23), 21);
  cursor -= 5;
  drawWrapped(`${payload.periodLabel} - ${payload.agency}`, margin, pageWidth - margin * 2, boldFont, 11);
  drawWrapped(`${DELIVERY_REPORT_TEXT.DATE}: ${payload.scheduledAt}    ${DELIVERY_REPORT_TEXT.LOCATION}: ${payload.location}`, margin, pageWidth - margin * 2, regularFont, 9, mutedColor);
  drawWrapped(`${DELIVERY_REPORT_TEXT.RESPONSIBLE}: ${payload.responsibleNames}`, margin, pageWidth - margin * 2, regularFont, 9, mutedColor);
  drawWrapped(`${DELIVERY_REPORT_TEXT.TOTAL_ASSIGNMENTS}: ${rows.length}    ${DELIVERY_REPORT_TEXT.TOTAL_FAMILIES}: ${new Set(payload.allocations.map((allocation) => allocation.familyId)).size}    ${DELIVERY_REPORT_TEXT.TOTAL_MODULES}: ${payload.allocations.reduce((total, allocation) => total + allocation.moduleQuantity, 0)}`, margin, pageWidth - margin * 2, boldFont, 10);
  cursor -= 8;

  const columns = { destination: margin, source: 245, quantity: 415, notes: 470 };
  const tableWidth = pageWidth - margin * 2;
  function drawTableHeader() {
    page.drawRectangle({ x: margin, y: cursor - 5, width: tableWidth, height: 22, color: rgb(0.91, 0.95, 0.92) });
    page.drawText(DELIVERY_REPORT_TEXT.DESTINATION, { x: columns.destination + 4, y: cursor + 2, size: 8, font: boldFont, color: textColor });
    page.drawText(DELIVERY_REPORT_TEXT.RECEIPT, { x: columns.source + 4, y: cursor + 2, size: 8, font: boldFont, color: textColor });
    page.drawText(DELIVERY_REPORT_TEXT.MODULES, { x: columns.quantity + 4, y: cursor + 2, size: 8, font: boldFont, color: textColor });
    page.drawText(DELIVERY_REPORT_TEXT.NOTES, { x: columns.notes + 4, y: cursor + 2, size: 8, font: boldFont, color: textColor });
    cursor -= 25;
  }
  drawTableHeader();

  for (const [index, allocation] of rows.entries()) {
    const destinationLines = wrapText(allocation.destination, regularFont, 8, columns.source - columns.destination - 10);
    const sourceLines = wrapText(allocation.source, regularFont, 8, columns.quantity - columns.source - 10);
    const noteLines = wrapText(allocation.notes || "-", regularFont, 8, pageWidth - margin - columns.notes - 8);
    const rowLines = Math.max(destinationLines.length, sourceLines.length, noteLines.length, 1);
    const rowHeight = rowLines * 11 + 8;
    if (cursor - rowHeight < 55) {
      page = pdf.addPage([pageWidth, pageHeight]);
      pages.push(page);
      cursor = pageHeight - 48;
      drawTableHeader();
    }
    if (index % 2) {
      page.drawRectangle({ x: margin, y: cursor - rowHeight + 4, width: tableWidth, height: rowHeight, color: rgb(0.975, 0.98, 0.975) });
    }
    const baseline = cursor - 8;
    destinationLines.forEach((line, lineIndex) => page.drawText(line, { x: columns.destination + 4, y: baseline - lineIndex * 11, size: 8, font: regularFont, color: textColor }));
    sourceLines.forEach((line, lineIndex) => page.drawText(line, { x: columns.source + 4, y: baseline - lineIndex * 11, size: 8, font: regularFont, color: textColor }));
    page.drawText(allocation.quantity, { x: columns.quantity + 4, y: baseline, size: 8, font: boldFont, color: textColor });
    noteLines.forEach((line, lineIndex) => page.drawText(line, { x: columns.notes + 4, y: baseline - lineIndex * 11, size: 8, font: regularFont, color: textColor }));
    cursor -= rowHeight;
  }

  if (payload.notes) {
    cursor -= 10;
    drawWrapped(`${DELIVERY_REPORT_TEXT.OBSERVATIONS}: ${payload.notes}`, margin, pageWidth - margin * 2, regularFont, 9, mutedColor, 13);
  }
  pages.forEach((reportPage, index) => {
    reportPage.drawText(`${index + 1} / ${pages.length}`, { x: pageWidth - margin - 38, y: 25, size: 8, font: regularFont, color: mutedColor });
    reportPage.drawText(DELIVERY_REPORT_TEXT.INTERNAL_DOCUMENT, { x: margin, y: 25, size: 8, font: regularFont, color: mutedColor });
  });
  return pdf.save();
}
