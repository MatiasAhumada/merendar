

import { BENEFICIARY_SHEET_COLUMN_HEADERS, BENEFICIARY_SHEET_PDF, DELIVERY_ERROR_MESSAGES, DELIVERY_UI_TEXT } from "@/constants/delivery.constant";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { beneficiarySheetSnapshotSchema } from "@/schemas/record.schema";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";

import type { BeneficiarySheetSnapshot } from "@/interfaces/beneficiary-sheet.interface";

type PrintableRow = {
  beneficiary: BeneficiarySheetSnapshot["beneficiaries"][number];
  index: number;
  nameLines: string[];
  familyLines: string[];
  addressLines: string[];
  height: number;
};

type ApprovedPrintableRow = {
  beneficiary: BeneficiarySheetSnapshot["beneficiaries"][number];
  index: number;
  nameLines: string[];
  addressLines: string[];
  neighborhoodLines: string[];
  height: number;
};

const { TABLE_BOUNDS: tableBounds, TITLE: title, TABLE_HEADER_HEIGHT: tableHeaderHeight, MINIMUM_ROW_HEIGHT: minimumRowHeight, ROW_LINE_HEIGHT: rowLineHeight, PAGE_BOTTOM: pageBottom } = BENEFICIARY_SHEET_PDF;

function wrapText(text: string, maxCharacters: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;

    if (nextLine.length > maxCharacters && line) {
      lines.push(line);
      line = word;
      continue;
    }

    line = nextLine;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function wrapToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const parts: string[] = [];
    let remainingWord = word;

    while (font.widthOfTextAtSize(remainingWord, fontSize) > maxWidth) {
      let splitAt = remainingWord.length;

      while (splitAt > 1 && font.widthOfTextAtSize(remainingWord.slice(0, splitAt), fontSize) > maxWidth) {
        splitAt -= 1;
      }

      parts.push(remainingWord.slice(0, splitAt));
      remainingWord = remainingWord.slice(splitAt);
    }

    parts.push(remainingWord);

    for (const part of parts) {
      const nextLine = line ? `${line} ${part}` : part;

      if (font.widthOfTextAtSize(nextLine, fontSize) > maxWidth && line) {
        lines.push(line);
        line = part;
      } else {
        line = nextLine;
      }
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function drawApprovedHeader(page: PDFPage, logo: PDFImage, boldFont: PDFFont, pageWidth: number, pageHeight: number) {
  const logoSize = logo.scaleToFit(130, 26);
  page.drawImage(logo, { x: pageWidth - 52 - logoSize.width, y: pageHeight - 48 - logoSize.height, ...logoSize });
  const titleWidth = boldFont.widthOfTextAtSize(title, 8.4);
  page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: pageHeight - 94, size: 8.4, font: boldFont, color: rgb(0, 0, 0) });
}

function drawApprovedColumnHeaders(page: PDFPage, boldFont: PDFFont, y: number) {
  const labels = Object.values(BENEFICIARY_SHEET_COLUMN_HEADERS);

  labels.forEach((label, index) => {
    const left = tableBounds[index] ?? 0;
    const right = tableBounds[index + 1] ?? left;
    const fontSize = index === 1 ? 7.1 : 6.7;

    if (index === 5) {
      const labelWidth = boldFont.widthOfTextAtSize("FECHA DE", fontSize);
      const secondLineWidth = boldFont.widthOfTextAtSize("ENTREGA", fontSize);
      page.drawText("FECHA DE", { x: left + ((right - left) - labelWidth) / 2, y: y - 8, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText("ENTREGA", { x: left + ((right - left) - secondLineWidth) / 2, y: y - 17, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });
      return;
    }

    const labelWidth = boldFont.widthOfTextAtSize(label.toUpperCase(), fontSize);
    const labelX = left + ((right - left) - labelWidth) / 2;
    page.drawText(label.toUpperCase(), { x: labelX, y: y - 15, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });
  });
}

function drawApprovedTableGrid(page: PDFPage, top: number, rowHeights: number[]) {
  const bottom = top - tableHeaderHeight - rowHeights.reduce((total, height) => total + height, 0);
  const stroke = rgb(0, 0, 0);

  for (const boundary of tableBounds) {
    page.drawLine({ start: { x: boundary, y: top }, end: { x: boundary, y: bottom }, thickness: 0.8, color: stroke });
  }

  page.drawLine({ start: { x: tableBounds[0], y: top }, end: { x: tableBounds[tableBounds.length - 1], y: top }, thickness: 0.8, color: stroke });
  let horizontalY = top - tableHeaderHeight;
  page.drawLine({ start: { x: tableBounds[0], y: horizontalY }, end: { x: tableBounds[tableBounds.length - 1], y: horizontalY }, thickness: 0.8, color: stroke });

  for (const height of rowHeights) {
    horizontalY -= height;
    page.drawLine({ start: { x: tableBounds[0], y: horizontalY }, end: { x: tableBounds[tableBounds.length - 1], y: horizontalY }, thickness: 0.8, color: stroke });
  }
}

async function createApprovedBeneficiarySheetPdf(snapshot: BeneficiarySheetSnapshot) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regularFont = await pdf.embedFont(await readFile(path.join(process.cwd(), "src/server/assets/DejaVuSans.ttf")), { subset: true });
  const boldFont = await pdf.embedFont(await readFile(path.join(process.cwd(), "src/server/assets/DejaVuSans-Bold.ttf")), { subset: true });
  const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public/brand/ministerio-desarrollo-social-tucuman.png")));
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const headerTop = pageHeight - 104;
  const textSize = 6.5;
  const rows: ApprovedPrintableRow[] = snapshot.beneficiaries.map((beneficiary, index) => {
    const nameLines = wrapToWidth(beneficiary.name, regularFont, textSize, tableBounds[2] - tableBounds[1] - 6);
    const addressLines = wrapToWidth(beneficiary.address, regularFont, textSize, tableBounds[4] - tableBounds[3] - 6);
    const neighborhoodLines = wrapToWidth(beneficiary.neighborhood ?? "", regularFont, textSize, tableBounds[5] - tableBounds[4] - 6);
    const lineCount = Math.max(nameLines.length, addressLines.length, neighborhoodLines.length, 1);

    return { beneficiary, index, nameLines, addressLines, neighborhoodLines, height: Math.max(minimumRowHeight, lineCount * rowLineHeight + 6) };
  });
  const printablePages: ApprovedPrintableRow[][] = [[]];
  let pageContentHeight = 0;
  const availableContentHeight = headerTop - tableHeaderHeight - pageBottom;

  for (const row of rows) {
    if (pageContentHeight && pageContentHeight + row.height > availableContentHeight) {
      printablePages.push([]);
      pageContentHeight = 0;
    }

    printablePages[printablePages.length - 1]?.push(row);
    pageContentHeight += row.height;
  }

  for (const pageRows of printablePages) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    drawApprovedHeader(page, logo, boldFont, pageWidth, pageHeight);
    drawApprovedColumnHeaders(page, boldFont, headerTop);
    const rowHeights = pageRows.map((row) => row.height);
    let usedRowsHeight = rowHeights.reduce((total, height) => total + height, 0);
    while (availableContentHeight - usedRowsHeight >= minimumRowHeight) {
      rowHeights.push(minimumRowHeight);
      usedRowsHeight += minimumRowHeight;
    }
    drawApprovedTableGrid(page, headerTop, rowHeights);
    let rowTop = headerTop - tableHeaderHeight;

    for (const row of pageRows) {
      const cellTextY = rowTop - 11;
      const numberText = String(row.index + 1);
      const numberWidth = regularFont.widthOfTextAtSize(numberText, textSize);
      page.drawText(numberText, { x: tableBounds[0] + ((tableBounds[1] - tableBounds[0]) - numberWidth) / 2, y: cellTextY, size: textSize, font: regularFont, color: rgb(0, 0, 0) });
      row.nameLines.forEach((line, lineIndex) => page.drawText(line, { x: tableBounds[1] + 3, y: cellTextY - lineIndex * rowLineHeight, size: textSize, font: regularFont, color: rgb(0, 0, 0) }));
      const dniWidth = regularFont.widthOfTextAtSize(row.beneficiary.dni, textSize);
      page.drawText(row.beneficiary.dni, { x: tableBounds[2] + ((tableBounds[3] - tableBounds[2]) - dniWidth) / 2, y: cellTextY, size: textSize, font: regularFont, color: rgb(0, 0, 0) });
      row.addressLines.forEach((line, lineIndex) => page.drawText(line, { x: tableBounds[3] + 3, y: cellTextY - lineIndex * rowLineHeight, size: textSize, font: regularFont, color: rgb(0, 0, 0) }));
      row.neighborhoodLines.forEach((line, lineIndex) => page.drawText(line, { x: tableBounds[4] + 3, y: cellTextY - lineIndex * rowLineHeight, size: textSize, font: regularFont, color: rgb(0, 0, 0) }));
      rowTop -= row.height;
    }
  }

  return pdf.save();
}

async function createLegacyBeneficiarySheetPdf(snapshot: BeneficiarySheetSnapshot) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regularFont = await pdf.embedFont(await readFile(path.join(process.cwd(), "src/server/assets/DejaVuSans.ttf")), { subset: true });
  const boldFont = await pdf.embedFont(await readFile(path.join(process.cwd(), "src/server/assets/DejaVuSans-Bold.ttf")), { subset: true });
  const institutionLogo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public/brand/ministerio-desarrollo-social-tucuman.png")));
  const ink = rgb(0.22, 0.15, 0.1);
  const muted = rgb(0.42, 0.36, 0.31);
  const accent = rgb(0.79, 0.39, 0.04);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 38;
  const institutionLogoSize = institutionLogo.scaleToFit(pageWidth - margin * 2, 80);
  const printablePageHeight = 560;
  const printRows = snapshot.beneficiaries.map((beneficiary, index) => {
    const nameLines = wrapText(beneficiary.name, 30);
    const familyLines = wrapText(beneficiary.familyName, 16);
    const addressLines = wrapText(beneficiary.address, 24);
    const lineCount = Math.max(nameLines.length + 1, familyLines.length, addressLines.length);

    return { beneficiary, index, nameLines, familyLines, addressLines, height: Math.max(42, lineCount * 10 + 8) };
  });
  const printablePages: PrintableRow[][] = [[]];
  let pageContentHeight = 0;

  for (const row of printRows) {
    if (pageContentHeight && pageContentHeight + row.height > printablePageHeight) {
      printablePages.push([]);
      pageContentHeight = 0;
    }

    printablePages[printablePages.length - 1]?.push(row);
    pageContentHeight += row.height;
  }

  const pageCount = Math.max(1, printablePages.length);

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    const { label, agency } = snapshot.period;
    const institutionLogoY = pageHeight - margin - institutionLogoSize.height;
    page.drawImage(institutionLogo, { x: margin, y: institutionLogoY, width: institutionLogoSize.width, height: institutionLogoSize.height });
    let y = institutionLogoY - 18;
    page.drawText(DELIVERY_UI_TEXT.MERENDAR_PLANILLA_DE_BENEFICIARIOS, { x: margin, y, size: 13, font: boldFont, color: accent });
    y -= 20;
    page.drawText(`${label} · ${agency} · ${snapshot.period.startsAt} al ${snapshot.period.endsAt}`, { x: margin, y, size: 9, font: regularFont, color: ink });
    y -= 16;
    page.drawText(`Versión ${snapshot.version} · Hoja ${pageIndex + 1} de ${pageCount}`, { x: margin, y, size: 8, font: regularFont, color: muted });
    y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.8, color: accent });
    y -= 20;
    const columns = BENEFICIARY_SHEET_PDF.APPROVED_COLUMN_BOUNDS.map((boundary) => boundary === "margin" ? margin : boundary);
    const headers = BENEFICIARY_SHEET_PDF.APPROVED_COLUMNS;

    headers.forEach((header, index) => page.drawText(header, { x: columns[index] ?? margin, y, size: 7, font: boldFont, color: ink }));
    y -= 12;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: muted });
    y -= 11;

    for (const { beneficiary, index, nameLines, familyLines, addressLines, height } of printablePages[pageIndex] ?? []) {
      const textY = y - 8;
      page.drawText(String(index + 1), { x: columns[0] ?? margin, y: textY, size: 8, font: regularFont, color: ink });
      nameLines.forEach((line, lineIndex) => page.drawText(line, { x: columns[1] ?? margin, y: textY - lineIndex * 10, size: 7, font: regularFont, color: ink }));
      page.drawText(`DNI ${beneficiary.dni}`, { x: columns[1] ?? margin, y: textY - nameLines.length * 10, size: 7, font: regularFont, color: muted });
      familyLines.forEach((line, lineIndex) => page.drawText(line, { x: columns[2] ?? margin, y: textY - lineIndex * 10, size: 7, font: regularFont, color: ink }));
      addressLines.forEach((line, lineIndex) => page.drawText(line, { x: columns[3] ?? margin, y: textY - lineIndex * 10, size: 7, font: regularFont, color: ink }));
      const signatureY = y - height / 2;
      page.drawLine({ start: { x: columns[4] ?? margin, y: signatureY }, end: { x: pageWidth - margin, y: signatureY }, thickness: 0.5, color: muted });
      page.drawLine({ start: { x: margin, y: y - height }, end: { x: pageWidth - margin, y: y - height }, thickness: 0.25, color: muted });
      y -= height;
    }

    page.drawText(DELIVERY_UI_TEXT.FIRMA_EN_PAPEL_ESTE_DOCUMENTO_ES_UNA_PLANILLA_PROPIA_DE_MERENDAR_NO_UN_FOR, {
      x: margin,
      y: 24,
      size: 7,
      font: regularFont,
      color: muted,
      maxWidth: pageWidth - margin * 2,
    });
  }

  return pdf.save();
}

export async function createBeneficiarySheetPdf(rawSnapshot: unknown) {
  const parsedSnapshot = beneficiarySheetSnapshotSchema.safeParse(rawSnapshot);

  if (!parsedSnapshot.success) {
    throw new Error(DELIVERY_ERROR_MESSAGES.LA_PLANILLA_GUARDADA_NO_TIENE_UN_FORMATO_VALIDO);
  }

  const snapshot: BeneficiarySheetSnapshot = parsedSnapshot.data;

  if (snapshot.templateVersion === 2) {
    return createApprovedBeneficiarySheetPdf(snapshot);
  }

  return createLegacyBeneficiarySheetPdf(snapshot);
}
