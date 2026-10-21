import { prisma } from "@/lib/prisma";

const documentSummarySelect = {
  id: true,
  originalName: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
} as const;

export const merchandiseRepository = {
  findAll() {
    return prisma.merchandisePeriod.findMany({
      include: {
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
  },
};
