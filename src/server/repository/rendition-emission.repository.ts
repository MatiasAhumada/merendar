import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readDocumentObject, storeDocumentObject } from "@/server/services/document-storage.service";
import type { StoredDocumentReference } from "@/interfaces/document-storage.interface";

export interface StoredRenditionEmissionFiles {
  note: StoredDocumentReference;
  summary: StoredDocumentReference;
  packageFile: StoredDocumentReference;
}

export async function storeRenditionEmissionFiles(id: string, input: { notePdf: Uint8Array; summaryPdf: Uint8Array; packagePdf: Uint8Array }): Promise<StoredRenditionEmissionFiles> {
  const [note, summary, packageFile] = await Promise.all([
    storeDocumentObject({ category: "rendition-emission", id: `${id}-note`, content: input.notePdf, contentType: "application/pdf" }),
    storeDocumentObject({ category: "rendition-emission", id: `${id}-summary`, content: input.summaryPdf, contentType: "application/pdf" }),
    storeDocumentObject({ category: "rendition-emission", id: `${id}-package`, content: input.packagePdf, contentType: "application/pdf" }),
  ]);
  return { note, summary, packageFile };
}

export type RenditionEmissionSourceRecord = Prisma.RenditionGetPayload<{
  include: {
    period: {
      include: {
        cycles: { orderBy: { createdAt: "asc" } };
        requests: {
          include: {
            quota: { include: { remittances: true } };
            remittances: { include: { documents: true } };
            items: true;
            documents: true;
            issuedDocuments: true;
          };
          orderBy: { requestedAt: "asc" };
        };
      };
    };
    beneficiarySheet: {
      include: {
        distributionEvent: {
          include: {
            familyDeliveries: {
              include: {
                family: { select: { id: true; name: true } };
                participants: {
                  include: {
                    familyMember: {
                      include: {
                        person: { select: { firstName: true; lastName: true; dni: true } };
                        missingDocuments: { select: { documentType: true } };
                      };
                    };
                  };
                };
              };
              orderBy: { createdAt: "asc" };
            };
          };
        };
      };
    };
    documents: {
      include: { supersededBy: { select: { id: true } } };
      orderBy: [{ documentType: "asc" }, { version: "asc" }];
    };
  };
}>;

type PdfDocument<T> = Omit<T, "content"> & { content: Uint8Array<ArrayBuffer> };
type EmissionRequest = RenditionEmissionSourceRecord["period"]["requests"][number];
type EmissionRemittance = EmissionRequest["remittances"][number];

export type RenditionEmissionSource = Omit<RenditionEmissionSourceRecord, "documents" | "period"> & {
  documents: Array<PdfDocument<RenditionEmissionSourceRecord["documents"][number]>>;
  period: Omit<RenditionEmissionSourceRecord["period"], "requests"> & {
    requests: Array<Omit<EmissionRequest, "documents" | "issuedDocuments" | "remittances"> & {
      documents: Array<PdfDocument<EmissionRequest["documents"][number]>>;
      issuedDocuments: Array<PdfDocument<EmissionRequest["issuedDocuments"][number]>>;
      remittances: Array<Omit<EmissionRemittance, "documents"> & { documents: Array<PdfDocument<EmissionRemittance["documents"][number]>> }>;
    }>;
  };
};

export class RenditionSubmissionDocumentLimitError extends Error {
  constructor() {
    super("La rendición alcanzó el máximo de 20 documentos.");
    this.name = "RenditionSubmissionDocumentLimitError";
  }
}

export async function findRenditionEmissionSource(renditionId: string, transaction?: Prisma.TransactionClient): Promise<RenditionEmissionSourceRecord | null> {
  const repository = transaction ?? prisma;
  return repository.rendition.findUnique({
    where: { id: renditionId },
    include: {
      period: {
        include: {
          cycles: { orderBy: { createdAt: "asc" } },
          requests: {
            include: {
              quota: { include: { remittances: true } },
              remittances: { include: { documents: true } },
              items: true,
              documents: true,
              issuedDocuments: true,
            },
            orderBy: { requestedAt: "asc" },
          },
        },
      },
      beneficiarySheet: {
        include: {
          distributionEvent: {
            include: {
              familyDeliveries: {
                include: {
                  family: { select: { id: true, name: true } },
                  participants: {
                    include: {
                      familyMember: {
                        include: {
                          person: { select: { firstName: true, lastName: true, dni: true } },
                          missingDocuments: { select: { documentType: true } },
                        },
                      },
                    },
                  },
                },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
      documents: {
        include: { supersededBy: { select: { id: true } } },
        orderBy: [{ documentType: "asc" }, { version: "asc" }],
      },
    },
  });
}

export async function saveRenditionEmissionInTransaction(transaction: Prisma.TransactionClient, input: {
  id?: string;
  renditionId: string;
  userId: string;
  snapshot: object;
  notePdf: Uint8Array;
  summaryPdf: Uint8Array;
  packagePdf: Uint8Array;
  storedFiles: StoredRenditionEmissionFiles;
}) {
  const latestEmission = await transaction.renditionEmission.findFirst({
    where: { renditionId: input.renditionId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latestEmission?.version ?? 0) + 1;

  const id = input.id ?? randomUUID();
  const { note: noteObject, summary: summaryObject, packageFile: packageObject } = input.storedFiles;
  const emissionData = {
    id,
    renditionId: input.renditionId,
    version,
    snapshot: input.snapshot,
    noteStorageBucket: noteObject.bucket,
    noteStorageKey: noteObject.objectKey,
    noteChecksum: noteObject.checksum,
    summaryStorageBucket: summaryObject.bucket,
    summaryStorageKey: summaryObject.objectKey,
    summaryChecksum: summaryObject.checksum,
    packageStorageBucket: packageObject.bucket,
    packageStorageKey: packageObject.objectKey,
    packageChecksum: packageObject.checksum,
    createdById: input.userId,
  };
  if (input.id) {
    return transaction.renditionEmission.create({ data: emissionData, select: { id: true, version: true, createdAt: true } });
  }

  return transaction.renditionEmission.create({
    data: emissionData,
    select: { id: true, version: true, createdAt: true },
  });
}

export async function saveRenditionEmission(input: {
  id?: string;
  renditionId: string;
  userId: string;
  snapshot: object;
  notePdf: Uint8Array;
  summaryPdf: Uint8Array;
  packagePdf: Uint8Array;
}) {
  const id = input.id ?? randomUUID();
  const storedFiles = await storeRenditionEmissionFiles(id, input);
  return prisma.$transaction((transaction) => saveRenditionEmissionInTransaction(transaction, { ...input, id, storedFiles }));
}

export async function findRenditionEmissionFile(id: string, kind: "note" | "summary" | "package") {
  const emission = await prisma.renditionEmission.findUnique({
    where: { id },
    select: { id: true, version: true, noteStorageBucket: true, noteStorageKey: true, summaryStorageBucket: true, summaryStorageKey: true, packageStorageBucket: true, packageStorageKey: true },
  });

  if (!emission) {
    return null;
  }

  let originalName = `expediente-rendicion-v${emission.version}.pdf`;
  let storageKey = emission.packageStorageKey;
  let storageBucket = emission.packageStorageBucket;

  if (kind === "note") {
    originalName = `nota-rendicion-v${emission.version}.pdf`;
    storageKey = emission.noteStorageKey;
    storageBucket = emission.noteStorageBucket;
  } else if (kind === "summary") {
    originalName = `resumen-rendicion-v${emission.version}.pdf`;
    storageKey = emission.summaryStorageKey;
    storageBucket = emission.summaryStorageBucket;
  }

  const content = await readDocumentObject(storageKey, storageBucket);
  return { originalName, contentType: "application/pdf", content };
}

export async function findLatestRenditionEmissionId(renditionId: string) {
  const emission = await prisma.renditionEmission.findFirst({
    where: { renditionId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return emission?.id ?? null;
}

export async function recordRenditionSubmission(input: {
  renditionId: string;
  userId: string;
  emissionId: string;
  submittedAt: string;
  recipient: string;
  externalReference?: string;
  notes?: string;
  evidenceDocument?: { id: string; originalName: string; content: Uint8Array };
}) {
  let evidenceObject = null;
  if (input.evidenceDocument) {
    evidenceObject = await storeDocumentObject({ category: "rendition", id: input.evidenceDocument.id, content: input.evidenceDocument.content, contentType: "application/pdf" });
  }
  return prisma.$transaction(async (transaction) => {
    let evidenceDocumentId: string | null = null;

    if (input.evidenceDocument) {
      if (!evidenceObject) {
        throw new Error("No se confirmó el respaldo de presentación en Cloudflare R2.");
      }
      const existingDocuments = await transaction.renditionDocument.findMany({ where: { renditionId: input.renditionId }, select: { documentType: true, version: true } });
      if (existingDocuments.length >= 20) {
        throw new RenditionSubmissionDocumentLimitError();
      }
      const nextVersion = existingDocuments.filter((document) => document.documentType === "RESPALDO").reduce((latestVersion, document) => Math.max(latestVersion, document.version), 0) + 1;
      const document = await transaction.renditionDocument.create({
        data: {
          id: input.evidenceDocument.id,
          operationId: input.evidenceDocument.id,
          renditionId: input.renditionId,
          documentType: "RESPALDO",
          version: nextVersion,
          originalName: input.evidenceDocument.originalName,
          contentType: "application/pdf",
          byteSize: input.evidenceDocument.content.byteLength,
          storageBucket: evidenceObject.bucket,
          storageKey: evidenceObject.objectKey,
          checksum: evidenceObject.checksum,
          uploadedById: input.userId,
        },
        select: { id: true },
      });
      evidenceDocumentId = document.id;
      await transaction.rendition.update({ where: { id: input.renditionId }, data: { reviewStatus: "PENDIENTE", reviewNotes: null, reviewedAt: null, reviewedById: null } });
    }

    return transaction.renditionSubmission.create({
      data: {
        renditionId: input.renditionId,
        emissionId: input.emissionId,
        submittedAt: new Date(`${input.submittedAt}T00:00:00.000Z`),
        recipient: input.recipient,
        externalReference: input.externalReference,
        notes: input.notes,
        evidenceDocumentId,
        recordedById: input.userId,
      },
      include: { recordedBy: { select: { id: true, name: true } } },
    });
  });
}
