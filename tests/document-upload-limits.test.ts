import assert from "node:assert/strict";
import test from "node:test";
import { RENDITION_LIMITS } from "@/constants/rendition.constant";
import { merchandiseDocumentSchema } from "@/schemas/merchandise.schema";
import { renditionDocumentFileSchema, renditionDocumentPayloadSchema } from "@/schemas/rendition.schema";

function attachmentReference(byteSize: number, id: string) {
  return {
    id,
    type: "RESPALDO" as const,
    originalName: `${id}.pdf`,
    contentType: "application/pdf" as const,
    contentBase64: "",
    attachmentId: crypto.randomUUID(),
    byteSize,
    checksum: "a".repeat(64),
  };
}

test("PDF escaneado de 924.622 bytes entra en los límites de mercadería y rendición", () => {
  const evidence = {
    originalName: "S5.pdf",
    contentType: "application/pdf",
    contentBase64: "",
    attachmentId: crypto.randomUUID(),
    byteSize: 924_622,
    checksum: "a".repeat(64),
  };
  assert.equal(merchandiseDocumentSchema.safeParse(evidence).success, true);
  assert.equal(renditionDocumentFileSchema.safeParse({ ...attachmentReference(924_622, "s5"), id: "s5" }).success, true);
});

test("el límite por archivo acepta 2 MiB y rechaza un byte adicional", () => {
  const atLimit = attachmentReference(RENDITION_LIMITS.MAX_DOCUMENT_BYTES, "at-limit");
  const overLimit = attachmentReference(RENDITION_LIMITS.MAX_DOCUMENT_BYTES + 1, "over-limit");
  assert.equal(renditionDocumentFileSchema.safeParse(atLimit).success, true);
  assert.equal(renditionDocumentFileSchema.safeParse(overLimit).success, false);
});

test("el agregado de rendición acepta 8 MiB y rechaza un byte adicional", () => {
  const documentsAtLimit = Array.from({ length: 4 }, (_, index) => attachmentReference(2 * 1024 * 1024, `within-${index}`));
  const documentsOverLimit = [...documentsAtLimit, attachmentReference(1, "extra")];
  const basePayload = {
    kind: "rendition_documents" as const,
    id: crypto.randomUUID(),
    periodId: "period-1",
    beneficiarySheetId: "sheet-1",
  };
  assert.equal(renditionDocumentPayloadSchema.safeParse({ ...basePayload, documents: documentsAtLimit }).success, true);
  assert.equal(renditionDocumentPayloadSchema.safeParse({ ...basePayload, documents: documentsOverLimit }).success, false);
});
