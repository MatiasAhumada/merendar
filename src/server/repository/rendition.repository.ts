import { prisma } from "@/lib/prisma";
import { getPendingParticipantVerifications } from "@/utils/participant-verification.util";
import { RENDITION_ERROR_MESSAGES } from "@/constants/rendition.constant";

export type RenditionReviewStatus = "REVISADA" | "OBSERVADA";

export async function findRenditionDocument(id: string) {
  return prisma.renditionDocument.findUnique({
    where: { id },
    select: { originalName: true, contentType: true, storageBucket: true, storageKey: true },
  });
}

export async function reviewRendition(input: {
  id: string;
  userId: string;
  status: RenditionReviewStatus;
  notes?: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const rendition = await transaction.rendition.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        beneficiarySheet: {
          select: {
            distributionEvent: {
              select: {
                familyDeliveries: {
                  select: {
                    family: { select: { name: true } },
                    participants: {
                      select: {
                        paperSignatureChecked: true,
                        physicalDniChecked: true,
                        familyMember: { select: { person: { select: { firstName: true, lastName: true } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!rendition) {
      return { type: "missing" as const };
    }

    const signedSheetCount = await transaction.renditionDocument.count({
      where: { renditionId: input.id, documentType: "PLANILLA_FIRMADA", supersededBy: { none: {} } },
    });

    if (!signedSheetCount) {
      return { type: "signed-sheet-required" as const };
    }

    const deliveries = rendition.beneficiarySheet.distributionEvent?.familyDeliveries ?? [];
    const pendingVerifications = getPendingParticipantVerifications(deliveries);
    if (pendingVerifications.length) {
      return { type: "participant-checks-required" as const, message: `${RENDITION_ERROR_MESSAGES.PARTICIPANT_CHECKS_REQUIRED}${pendingVerifications.join("; ")}` };
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
