import { z } from "zod";
import { prisma } from "@/lib/prisma";

const documentSummarySelect = {
  id: true,
  originalName: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
} as const;

const beneficiaryCountSchema = z.object({ beneficiaries: z.array(z.unknown()) });

function beneficiaryCount(snapshot: unknown) {
  const parsedSnapshot = beneficiaryCountSchema.safeParse(snapshot);
  return parsedSnapshot.success ? parsedSnapshot.data.beneficiaries.length : 0;
}

export const merchandiseRepository = {
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
            quota: { include: { approvedBy: { select: { id: true, name: true } } } },
            remittances: {
              include: {
                createdBy: { select: { id: true, name: true } },
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
    }));
  },
};
