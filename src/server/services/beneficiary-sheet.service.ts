import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { z } from "zod";
import type { BeneficiarySheetSnapshot } from "@/validations/record.validation";

type PrintableRow = {
  beneficiary: BeneficiarySheetSnapshot["beneficiaries"][number];
  index: number;
  nameLines: string[];
  familyLines: string[];
  addressLines: string[];
  height: number;
};

export const BENEFICIARY_SHEET_COLUMN_HEADERS = {
  number: "N°",
  beneficiary: "Beneficiario / DNI",
  family: "Familia",
  address: "Domicilio",
  signature: "Firma manuscrita",
} as const;

const snapshotSchema = z.object({
  period: z.object({ label: z.string(), agency: z.string(), startsAt: z.string(), endsAt: z.string() }),
  version: z.number().int().positive(),
  createdAt: z.string(),
  beneficiaries: z.array(z.object({ personId: z.string(), name: z.string(), dni: z.string(), familyName: z.string(), address: z.string() })),
});

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

export async function createBeneficiarySheetPdf(rawSnapshot: unknown) {
  const parsedSnapshot = snapshotSchema.safeParse(rawSnapshot);

  if (!parsedSnapshot.success) {
    throw new Error("La planilla guardada no tiene un formato válido");
  }

  const snapshot: BeneficiarySheetSnapshot = parsedSnapshot.data;
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
    page.drawText("MERENDAR · PLANILLA DE BENEFICIARIOS", { x: margin, y, size: 13, font: boldFont, color: accent });
    y -= 20;
    page.drawText(`${label} · ${agency} · ${snapshot.period.startsAt} al ${snapshot.period.endsAt}`, { x: margin, y, size: 9, font: regularFont, color: ink });
    y -= 16;
    page.drawText(`Versión ${snapshot.version} · Hoja ${pageIndex + 1} de ${pageCount}`, { x: margin, y, size: 8, font: regularFont, color: muted });
    y -= 16;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.8, color: accent });
    y -= 20;
    const columns = [margin, 54, 196, 275, 384];
    const headers = Object.values(BENEFICIARY_SHEET_COLUMN_HEADERS);

    headers.forEach((header, index) => page.drawText(header, { x: columns[index], y, size: 7, font: boldFont, color: ink }));
    y -= 12;
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: muted });
    y -= 11;
    const beneficiaries = printablePages[pageIndex] ?? [];

    beneficiaries.forEach(({ beneficiary, index, nameLines, familyLines, addressLines, height }) => {
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
    });

    page.drawText("Firma en papel. Este documento es una planilla propia de Merendar, no un formulario oficial ministerial.", {
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
