import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/utils/handlers/apiError.handler";

export async function changeDistributionEventStatus(input: {
  eventId: string;
  status: "ABIERTA" | "CERRADA";
  expectedStatus: "ABIERTA" | "CERRADA";
}) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "DistributionEvent" WHERE "id" = ${input.eventId} FOR UPDATE`);
    const event = await transaction.distributionEvent.findUnique({
      where: { id: input.eventId },
      select: { id: true, status: true, version: true },
    });
    if (!event) {
      throw new ApiError({ status: 404, message: "No encontramos esa jornada." });
    }
    if (event.status !== input.expectedStatus) {
      throw new ApiError({ status: 409, message: "La jornada cambió en otra sesión. Actualizá la vista antes de volver a intentarlo." });
    }

    return transaction.distributionEvent.update({
      where: { id: event.id },
      data: { status: input.status, version: { increment: 1 } },
      select: { id: true, status: true, version: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
