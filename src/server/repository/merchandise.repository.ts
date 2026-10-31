import { beneficiaryCountSchema } from "@/schemas/synchronization.schema";
import { prisma } from "@/lib/prisma";
import { merchandiseRequestDocumentSnapshotSchema } from "@/schemas/merchandise-request-document.schema";

const documentSummarySelect = {
  id: true,
  originalName: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
} as const;


function beneficiaryCount(snapshot: unknown) {
  const parsedSnapshot = beneficiaryCountSchema.safeParse(snapshot);
  return parsedSnapshot.success ? parsedSnapshot.data.beneficiaries.length : 0;
}

export const merchandiseRepository = {
  async findDocument(id: string) {
    const existingDocument = await prisma.merchandiseDocument.findUnique({
      where: { id },
      select: { originalName: true, contentType: true, content: true },
    });
    if (existingDocument) {
      return existingDocument;
    }
    return prisma.merchandiseRequestDocument.findUnique({ where: { id }, select: { originalName: true, contentType: true, content: true } });
  },

  async findAll() {
    const periods = await prisma.merchandisePeriod.findMany({
      include: {
        beneficiarySheets: {
          select: { id: true, version: true, createdAt: true, snapshot: true },
          orderBy: { version: "desc" },
        },
        renditions: {
          include: {
            beneficiarySheet: { select: { id: true, version: true, createdAt: true, snapshot: true } },
            documents: {
              select: { id: true, documentType: true, version: true, supersedesId: true, originalName: true, byteSize: true, createdAt: true },
              orderBy: [{ documentType: "asc" }, { version: "asc" }],
            },
          },
          orderBy: { createdAt: "desc" },
        },
        requests: {
          include: {
            createdBy: { select: { id: true, name: true } },
            quota: { include: { approvedBy: { select: { id: true, name: true } }, items: true } },
            items: true,
            issuedDocuments: {
              select: { id: true, kind: true, version: true, templateVersion: true, snapshot: true, originalName: true, contentType: true, createdAt: true },
              orderBy: [{ kind: "asc" }, { version: "desc" }],
            },
            remittances: {
              include: {
                createdBy: { select: { id: true, name: true } },
                items: true,
                documents: { select: documentSummarySelect, orderBy: { createdAt: "asc" } },
              },
              orderBy: { receivedAt: "desc" },
            },
            documents: { select: documentSummarySelect, orderBy: { createdAt: "asc" } },
          },
          orderBy: { requestedAt: "desc" },
        },
      },
      orderBy: { startsAt: "desc" },
    });

    return periods.map((period) => ({
      ...period,
      beneficiarySheets: period.beneficiarySheets.map((sheet) => ({
        id: sheet.id,
        version: sheet.version,
        createdAt: sheet.createdAt,
        beneficiaryCount: beneficiaryCount(sheet.snapshot),
      })),
      renditions: period.renditions.map((rendition) => ({
        ...rendition,
        beneficiarySheet: {
          id: rendition.beneficiarySheet.id,
          version: rendition.beneficiarySheet.version,
          createdAt: rendition.beneficiarySheet.createdAt,
          beneficiaryCount: beneficiaryCount(rendition.beneficiarySheet.snapshot),
        },
      })),
      requests: period.requests.map((request) => {
        let item = null;
        if (request.items[0]) {
          item = { ...request.items[0], requestedQuantity: request.items[0].requestedQuantity.toNumber() };
        }
        let quota = null;
        if (request.quota) {
          quota = {
            ...request.quota,
            approvedQuantity: request.quota.approvedQuantity.toNumber(),
            items: request.quota.items.map((quotaItem) => ({ ...quotaItem, authorizedQuantity: quotaItem.authorizedQuantity.toNumber() })),
          };
        }
        return {
          ...request,
          issuedDocuments: request.issuedDocuments.map((document) => ({ ...document, snapshot: merchandiseRequestDocumentSnapshotSchema.parse(document.snapshot) })),
          requestedQuantity: request.requestedQuantity.toNumber(),
          item,
          quota,
          remittances: request.remittances.map((remittance) => ({
            ...remittance,
            receivedQuantity: remittance.receivedQuantity.toNumber(),
            items: remittance.items.map((receiptItem) => ({ ...receiptItem, receivedQuantity: receiptItem.receivedQuantity.toNumber() })),
          })),
        };
      }),
    }));
  },
};
