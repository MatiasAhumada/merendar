import { prisma } from "@/lib/prisma";

export type RenditionReviewStatus = "REVISADA" | "OBSERVADA";

export async function findRenditionDocument(id: string) {
  return prisma.renditionDocument.findUnique({
    where: { id },
    select: { originalName: true, contentType: true, content: true },
  });
}

export async function reviewRendition(input: {
  id: string;
  userId: string;
  status: RenditionReviewStatus;
  notes?: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const rendition = await transaction.rendition.findUnique({ where: { id: input.id }, select: { id: true } });

    if (!rendition) {
      return { type: "missing" as const };
    }

    const signedSheetCount = await transaction.renditionDocument.count({
      where: { renditionId: input.id, documentType: "PLANILLA_FIRMADA", supersededBy: { none: {} } },
    });

    if (!signedSheetCount) {
      return { type: "signed-sheet-required" as const };
    }

    const updatedRendition = await transaction.rendition.update({
      where: { id: input.id },
      data: {
        reviewStatus: input.status,
        reviewNotes: input.notes ?? null,
        reviewedAt: new Date(),
        reviewedById: input.userId,
      },
      select: { id: true, reviewStatus: true, reviewNotes: true, reviewedAt: true },
    });

    return { type: "reviewed" as const, rendition: updatedRendition };
  });
}
