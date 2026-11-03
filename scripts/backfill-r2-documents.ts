import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDocumentChecksum, readDocumentObject, storeDocumentObject } from "@/server/services/document-storage.service";
import { createBeneficiarySheetPdf } from "@/server/services/beneficiary-sheet.service";
import { z } from "zod";

const BATCH_SIZE = 50;
const CHECKPOINT_PATH = join(process.cwd(), ".local", "r2-backfill-checkpoint.json");
const checkpointSchema = z.record(z.string(), z.object({ processed: z.number().int().nonnegative(), lastId: z.string().optional() }));
const options = new Set(process.argv.slice(2));
const applyChanges = options.has("--apply");

interface BinaryDocumentRow {
  id: string;
  originalName: string;
  contentType: string;
  content: Uint8Array | null;
}

interface EmissionRow {
  id: string;
  notePdf: Uint8Array | null;
  summaryPdf: Uint8Array | null;
  packagePdf: Uint8Array | null;
}

interface SheetRow {
  id: string;
  snapshot: Prisma.JsonValue;
}

async function main() {
let checkpoint: Record<string, { processed: number; lastId?: string }> = {};
let checkpointWrite: Promise<void> = Promise.resolve();
try {
  checkpoint = checkpointSchema.parse(JSON.parse(await readFile(CHECKPOINT_PATH, "utf8")));
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
    throw error;
  }
  checkpoint = {};
}

async function saveCheckpoint(name: string, id: string) {
  const previous = checkpoint[name]?.processed ?? 0;
  checkpoint[name] = { processed: previous + 1, lastId: id };
  checkpointWrite = checkpointWrite.then(async () => {
    await mkdir(join(process.cwd(), ".local"), { recursive: true });
    await writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
  });
  await checkpointWrite;
}

async function countMissing(table: "MerchandiseDocument" | "MerchandiseRequestDocument" | "RenditionDocument") {
  const columns = await prisma.$queryRaw<Array<{ hasContent: boolean }>>(Prisma.sql`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = 'content') AS "hasContent"`);
  if (!columns[0]?.hasContent) {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*) AS count FROM ${Prisma.raw(`"${table}"`)} WHERE "storageKey" IS NULL`);
    return { count: Number(rows[0]?.count ?? 0), bytes: 0 };
  }

  const rows = await prisma.$queryRaw<Array<{ count: bigint; bytes: bigint }>>(Prisma.sql`SELECT COUNT(*) AS count, COALESCE(SUM(octet_length("content")), 0) AS bytes FROM ${Prisma.raw(`"${table}"`)} WHERE "storageKey" IS NULL`);
  return { count: Number(rows[0]?.count ?? 0), bytes: Number(rows[0]?.bytes ?? 0) };
}

async function processBinaryTable(table: "MerchandiseDocument" | "MerchandiseRequestDocument" | "RenditionDocument") {
  const summary = await countMissing(table);
  console.log(`${table}: ${summary.count} objetos pendientes, ${summary.bytes} bytes${applyChanges ? " (subida habilitada)" : " (dry-run)"}`);
  if (!applyChanges) {
    return;
  }

  while (true) {
    const rows = await prisma.$queryRaw<BinaryDocumentRow[]>(Prisma.sql`SELECT "id", "originalName", "contentType", "content" FROM ${Prisma.raw(`"${table}"`)} WHERE "storageKey" IS NULL ORDER BY "id" LIMIT ${BATCH_SIZE}`);
    if (rows.length === 0) {
      return;
    }
    for (const row of rows) {
      if (!row.content) {
        throw new Error(`${table}/${row.id} no tiene contenido para backfill.`);
      }
      const object = await storeDocumentObject({ category: table.toLowerCase(), id: row.id, content: row.content, contentType: row.contentType });
      const verifiedContent = await readDocumentObject(object.objectKey);
      if (verifiedContent.byteLength !== row.content.byteLength || getDocumentChecksum(verifiedContent) !== object.checksum) {
        throw new Error(`${table}/${row.id} no pasó la verificación de lectura y checksum.`);
      }
      if (table === "MerchandiseDocument") {
        await prisma.merchandiseDocument.update({ where: { id: row.id }, data: { storageBucket: object.bucket, storageKey: object.objectKey, checksum: object.checksum } });
      } else if (table === "MerchandiseRequestDocument") {
        await prisma.merchandiseRequestDocument.update({ where: { id: row.id }, data: { storageBucket: object.bucket, storageKey: object.objectKey, checksum: object.checksum, byteSize: object.byteSize } });
      } else {
        await prisma.renditionDocument.update({ where: { id: row.id }, data: { storageBucket: object.bucket, storageKey: object.objectKey, checksum: object.checksum } });
      }
      await saveCheckpoint(table, row.id);
    }
  }
}

async function processEmissions() {
  const summary = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*) AS count FROM "RenditionEmission" WHERE "noteStorageKey" IS NULL OR "summaryStorageKey" IS NULL OR "packageStorageKey" IS NULL`);
  console.log(`RenditionEmission: ${Number(summary[0]?.count ?? 0)} emisiones pendientes (3 objetos cada una)${applyChanges ? " (subida habilitada)" : " (dry-run)"}`);
  if (!applyChanges) {
    return;
  }
  while (true) {
    const rows = await prisma.$queryRaw<EmissionRow[]>(Prisma.sql`SELECT "id", "notePdf", "summaryPdf", "packagePdf" FROM "RenditionEmission" WHERE "noteStorageKey" IS NULL OR "summaryStorageKey" IS NULL OR "packageStorageKey" IS NULL ORDER BY "id" LIMIT ${BATCH_SIZE}`);
    if (!rows.length) {
      return;
    }
    for (const row of rows) {
      if (!row.notePdf || !row.summaryPdf || !row.packagePdf) {
        throw new Error(`RenditionEmission/${row.id} está incompleta; se conservan sus binarios originales.`);
      }
      const [note, summary, packageFile] = await Promise.all([
        storeDocumentObject({ category: "rendition-emission", id: `${row.id}-note`, content: row.notePdf, contentType: "application/pdf" }),
        storeDocumentObject({ category: "rendition-emission", id: `${row.id}-summary`, content: row.summaryPdf, contentType: "application/pdf" }),
        storeDocumentObject({ category: "rendition-emission", id: `${row.id}-package`, content: row.packagePdf, contentType: "application/pdf" }),
      ]);
      const verifiedContent = await Promise.all([note, summary, packageFile].map((object) => readDocumentObject(object.objectKey)));
      const expectedChecksums = [note, summary, packageFile].map((object) => object.checksum);
      if (verifiedContent.some((content, index) => getDocumentChecksum(content) !== expectedChecksums[index])) {
        throw new Error(`RenditionEmission/${row.id} no pasó la verificación de lectura y checksum.`);
      }
      await prisma.renditionEmission.update({ where: { id: row.id }, data: { noteStorageBucket: note.bucket, noteStorageKey: note.objectKey, noteChecksum: note.checksum, summaryStorageBucket: summary.bucket, summaryStorageKey: summary.objectKey, summaryChecksum: summary.checksum, packageStorageBucket: packageFile.bucket, packageStorageKey: packageFile.objectKey, packageChecksum: packageFile.checksum } });
      await saveCheckpoint("RenditionEmission", row.id);
    }
  }
}

async function processSheets() {
  const pending = await prisma.beneficiarySheet.count({ where: { storageKey: null } });
  console.log(`BeneficiarySheet: ${pending} instantáneas pendientes de materialización${applyChanges ? " (subida habilitada)" : " (dry-run)"}`);
  if (!applyChanges) {
    return;
  }
  while (true) {
    const rows = await prisma.beneficiarySheet.findMany({ where: { storageKey: null }, select: { id: true, snapshot: true }, orderBy: { id: "asc" }, take: BATCH_SIZE }) as SheetRow[];
    if (!rows.length) {
      return;
    }
    for (const row of rows) {
      const pdf = await createBeneficiarySheetPdf(row.snapshot);
      const object = await storeDocumentObject({ category: "beneficiary-sheet", id: row.id, content: pdf, contentType: "application/pdf" });
      const verifiedPdf = await readDocumentObject(object.objectKey);
      if (verifiedPdf.byteLength !== pdf.byteLength || getDocumentChecksum(verifiedPdf) !== object.checksum) {
        throw new Error(`BeneficiarySheet/${row.id} no pasó la verificación de lectura y checksum.`);
      }
      await prisma.beneficiarySheet.updateMany({ where: { id: row.id, storageKey: null }, data: { storageBucket: object.bucket, storageKey: object.objectKey, checksum: object.checksum, byteSize: object.byteSize, storageStatus: "CONFIRMED" } });
      await saveCheckpoint("BeneficiarySheet", row.id);
    }
  }
}

try {
  await Promise.all([
    processBinaryTable("MerchandiseDocument"),
    processBinaryTable("MerchandiseRequestDocument"),
    processBinaryTable("RenditionDocument"),
    processEmissions(),
    processSheets(),
  ]);
  const remaining = await Promise.all([
    countMissing("MerchandiseDocument"),
    countMissing("MerchandiseRequestDocument"),
    countMissing("RenditionDocument"),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*) AS count FROM "RenditionEmission" WHERE "noteStorageKey" IS NULL OR "summaryStorageKey" IS NULL OR "packageStorageKey" IS NULL`).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.beneficiarySheet.count({ where: { storageKey: null } }),
  ]);
  const remainingCount = remaining[0].count + remaining[1].count + remaining[2].count + remaining[3] + remaining[4];
  console.log(`Pendientes al finalizar: ${remainingCount}`);
} finally {
  await prisma.$disconnect();
}
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
