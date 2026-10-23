import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { BeneficiarySheetDraft } from "@/validations/record.validation";

interface PrintableRow {
  beneficiary: BeneficiarySheetDraft["beneficiaries"][number];
  index: number;
  nameLines: string[];
  familyLines: string[];
  addressLines: string[];
  height: number;
}

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

export async function createLocalBeneficiarySheetPdf(draft: BeneficiarySheetDraft) {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.22, 0.15, 0.1);
  const muted = rgb(0.42, 0.36, 0.31);
  const accent = rgb(0.79, 0.39, 0.04);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 38;
  const rows: PrintableRow[] = draft.beneficiaries.map((beneficiary, index) => {
    const nameLines = wrapText(beneficiary.name, 30);
    const familyLines = wrapText(beneficiary.familyName, 16);
    const addressLines = wrapText(beneficiary.address, 24);
    const lineCount = Math.max(nameLines.length + 1, familyLines.length, addressLines.length);
    return { beneficiary, index, nameLines, familyLines, addressLines, height: Math.max(42, lineCount * 10 + 8) };
  });
  const printablePages: PrintableRow[][] = [[]];
  let pageContentHeight = 0;

  for (const row of rows) {
    if (pageContentHeight && pageContentHeight + row.height > 650) {
      printablePages.push([]);
      pageContentHeight = 0;
    }
    printablePages[printablePages.length - 1]?.push(row);
    pageContentHeight += row.height;
  }

  for (let pageIndex = 0; pageIndex < printablePages.length; pageIndex += 1) {
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawText("MERENDAR · PLANILLA DE BENEFICIARIOS", { x: margin, y: pageHeight - 44, size: 13, font: boldFont, color: accent });
    page.drawText(`${draft.period.label} · ${draft.period.agency} · ${draft.period.startsAt} al ${draft.period.endsAt}`, { x: margin, y: pageHeight - 64, size: 9, font: regularFont, color: ink });
    page.drawText(`Borrador local ${draft.id.slice(0, 8).toUpperCase()} · sin versión oficial asignada`, { x: margin, y: pageHeight - 80, size: 8, font: regularFont, color: muted });
    let y = pageHeight - 108;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.8, color: accent });
    y -= 20;
    const columns = [margin, 54, 196, 275, 384];
    const headers = ["N°", "Beneficiario / DNI", "Grupo", "Domicilio", "Firma manuscrita"];
    headers.forEach((header, index) => page.drawText(header, { x: columns[index], y, size: 7, font: boldFont, color: ink }));
    y -= 12;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: muted });
    y -= 11;

    for (const { beneficiary, index, nameLines, familyLines, addressLines, height } of printablePages[pageIndex] ?? []) {
      const textY = y - 8;
      page.drawText(String(index + 1), { x: columns[0], y: textY, size: 8, font: regularFont, color: ink });
      nameLines.forEach((line, lineIndex) => page.drawText(line, { x: columns[1], y: textY - lineIndex * 10, size: 7, font: regularFont, color: ink }));
      page.drawText(`DNI ${beneficiary.dni}`, { x: columns[1], y: textY - nameLines.length * 10, size: 7, font: regularFont, color: muted });
      familyLines.forEach((line, lineIndex) => page.drawText(line, { x: columns[2], y: textY - lineIndex * 10, size: 7, font: regularFont, color: ink }));
      addressLines.forEach((line, lineIndex) => page.drawText(line, { x: columns[3], y: textY - lineIndex * 10, size: 7, font: regularFont, color: ink }));
      const signatureY = y - height / 2;
      page.drawLine({ start: { x: columns[4], y: signatureY }, end: { x: pageWidth - margin, y: signatureY }, thickness: 0.5, color: muted });
      page.drawLine({ start: { x: margin, y: y - height }, end: { x: pageWidth - margin, y: y - height }, thickness: 0.25, color: muted });
      y -= height;
    }

    page.drawText("Firma en papel. Planilla propia de Merendar; no es un formulario oficial ministerial.", {
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
