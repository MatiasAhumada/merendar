

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { BENEFICIARY_SHEET_COLUMN_HEADERS, BENEFICIARY_SHEET_PDF } from "@/constants/delivery.constant";
import type { BeneficiarySheetDraft } from "@/types/schema-contracts";

const { TABLE_BOUNDS: tableBounds, TITLE: title, TABLE_HEADER_HEIGHT: tableHeaderHeight, MINIMUM_ROW_HEIGHT: minimumRowHeight, ROW_LINE_HEIGHT: rowLineHeight, PAGE_BOTTOM: pageBottom } = BENEFICIARY_SHEET_PDF;

type PrintableRow = {
  beneficiary: BeneficiarySheetDraft["beneficiaries"][number];
  index: number;
  nameLines: string[];
  addressLines: string[];
  neighborhoodLines: string[];
  height: number;
};

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const wordParts: string[] = [];
    let remainingWord = word;

    while (font.widthOfTextAtSize(remainingWord, fontSize) > maxWidth) {
      let splitAt = remainingWord.length;

      while (splitAt > 1 && font.widthOfTextAtSize(remainingWord.slice(0, splitAt), fontSize) > maxWidth) {
        splitAt -= 1;
      }

      wordParts.push(remainingWord.slice(0, splitAt));
      remainingWord = remainingWord.slice(splitAt);
    }

    wordParts.push(remainingWord);

    for (const wordPart of wordParts) {
      const nextLine = line ? `${line} ${wordPart}` : wordPart;

      if (font.widthOfTextAtSize(nextLine, fontSize) > maxWidth && line) {
        lines.push(line);
        line = wordPart;
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

export async function createLocalBeneficiarySheetPdf(draft: BeneficiarySheetDraft, logoBytes: Uint8Array) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(logoBytes);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const textSize = 6.5;
  const headerTop = pageHeight - 104;
  const rows: PrintableRow[] = draft.beneficiaries.map((beneficiary, index) => {
    const nameLines = wrapText(beneficiary.name, regularFont, textSize, tableBounds[2] - tableBounds[1] - 6);
    const addressLines = wrapText(beneficiary.address, regularFont, textSize, tableBounds[4] - tableBounds[3] - 6);
    const neighborhoodLines = wrapText(beneficiary.neighborhood ?? "", regularFont, textSize, tableBounds[5] - tableBounds[4] - 6);
    const lineCount = Math.max(nameLines.length, addressLines.length, neighborhoodLines.length, 1);

    return { beneficiary, index, nameLines, addressLines, neighborhoodLines, height: Math.max(minimumRowHeight, lineCount * rowLineHeight + 6) };
  });
  const printablePages: PrintableRow[][] = [[]];
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
    const logoSize = logo.scaleToFit(130, 26);
    page.drawImage(logo, { x: pageWidth - 52 - logoSize.width, y: pageHeight - 48 - logoSize.height, ...logoSize });
    const titleWidth = boldFont.widthOfTextAtSize(title, 8.4);
    page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: pageHeight - 94, size: 8.4, font: boldFont, color: rgb(0, 0, 0) });
    const labels = Object.values(BENEFICIARY_SHEET_COLUMN_HEADERS);

    labels.forEach((label, index) => {
      const left = tableBounds[index] ?? 0;
      const right = tableBounds[index + 1] ?? left;
      const fontSize = index === 1 ? 7.1 : 6.7;

      if (index === 5) {
        const firstLineWidth = boldFont.widthOfTextAtSize("FECHA DE", fontSize);
        const secondLineWidth = boldFont.widthOfTextAtSize("ENTREGA", fontSize);
        page.drawText("FECHA DE", { x: left + ((right - left) - firstLineWidth) / 2, y: headerTop - 8, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });
        page.drawText("ENTREGA", { x: left + ((right - left) - secondLineWidth) / 2, y: headerTop - 17, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });
        return;
      }

      const labelWidth = boldFont.widthOfTextAtSize(label.toUpperCase(), fontSize);
      page.drawText(label.toUpperCase(), { x: left + ((right - left) - labelWidth) / 2, y: headerTop - 15, size: fontSize, font: boldFont, color: rgb(0, 0, 0) });
    });

    const rowHeights = pageRows.map((row) => row.height);
    let usedRowsHeight = rowHeights.reduce((total, height) => total + height, 0);

    while (availableContentHeight - usedRowsHeight >= minimumRowHeight) {
      rowHeights.push(minimumRowHeight);
      usedRowsHeight += minimumRowHeight;
    }
    const bottom = headerTop - tableHeaderHeight - rowHeights.reduce((total, height) => total + height, 0);
    const stroke = rgb(0, 0, 0);
    tableBounds.forEach((boundary) => page.drawLine({ start: { x: boundary, y: headerTop }, end: { x: boundary, y: bottom }, thickness: 0.8, color: stroke }));
    page.drawLine({ start: { x: tableBounds[0], y: headerTop }, end: { x: tableBounds[tableBounds.length - 1], y: headerTop }, thickness: 0.8, color: stroke });
    let horizontalY = headerTop - tableHeaderHeight;
    page.drawLine({ start: { x: tableBounds[0], y: horizontalY }, end: { x: tableBounds[tableBounds.length - 1], y: horizontalY }, thickness: 0.8, color: stroke });

    for (const height of rowHeights) {
      horizontalY -= height;
      page.drawLine({ start: { x: tableBounds[0], y: horizontalY }, end: { x: tableBounds[tableBounds.length - 1], y: horizontalY }, thickness: 0.8, color: stroke });
    }

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
