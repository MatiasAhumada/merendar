import { prisma } from "@/lib/prisma";
import { ApiError } from "@/utils/handlers/apiError.handler";

export async function updateDistributionParticipantVerifications(input: {
  participantId: string;
  paperSignatureChecked: boolean;
  physicalDniChecked: boolean;
}) {
  const participant = await prisma.distributionParticipant.findUnique({ where: { id: input.participantId }, select: { id: true } });
  if (!participant) {
    throw new ApiError({ status: 404, message: "No encontramos el participante del retiro seleccionado." });
  }

  return prisma.distributionParticipant.update({
    where: { id: input.participantId },
    data: { paperSignatureChecked: input.paperSignatureChecked, physicalDniChecked: input.physicalDniChecked },
    select: { id: true, paperSignatureChecked: true, physicalDniChecked: true },
  });
}
