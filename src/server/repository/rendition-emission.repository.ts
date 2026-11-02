import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type RenditionEmissionSource = Prisma.RenditionGetPayload<{
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

export class RenditionSubmissionDocumentLimitError extends Error {
  constructor() {
    super("La rendición alcanzó el máximo de 20 documentos.");
    this.name = "RenditionSubmissionDocumentLimitError";
  }
}

export async function findRenditionEmissionSource(renditionId: string, transaction?: Prisma.TransactionClient) {
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
}) {
  const latestEmission = await transaction.renditionEmission.findFirst({
    where: { renditionId: input.renditionId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latestEmission?.version ?? 0) + 1;

  const emissionData = {
    renditionId: input.renditionId,
    version,
    snapshot: input.snapshot,
    notePdf: Buffer.from(input.notePdf),
    summaryPdf: Buffer.from(input.summaryPdf),
    packagePdf: Buffer.from(input.packagePdf),
    createdById: input.userId,
  };
  if (input.id) {
    return transaction.renditionEmission.create({ data: { ...emissionData, id: input.id }, select: { id: true, version: true, createdAt: true } });
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
  return prisma.$transaction((transaction) => saveRenditionEmissionInTransaction(transaction, input));
}

export async function findRenditionEmissionFile(id: string, kind: "note" | "summary" | "package") {
  const emission = await prisma.renditionEmission.findUnique({
    where: { id },
    select: { id: true, version: true, notePdf: true, summaryPdf: true, packagePdf: true },
  });

  if (!emission) {
    return null;
  }

  let originalName = `expediente-rendicion-v${emission.version}.pdf`;
  let content = emission.packagePdf;

  if (kind === "note") {
    originalName = `nota-rendicion-v${emission.version}.pdf`;
    content = emission.notePdf;
  } else if (kind === "summary") {
    originalName = `resumen-rendicion-v${emission.version}.pdf`;
    content = emission.summaryPdf;
  }

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
  return prisma.$transaction(async (transaction) => {
    let evidenceDocumentId: string | null = null;

    if (input.evidenceDocument) {
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
          content: Buffer.from(input.evidenceDocument.content),
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
