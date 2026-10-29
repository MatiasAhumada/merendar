

import { OFFLINE_OPERATION_MESSAGES, SYNC_SERVER_MESSAGES } from "@/constants/offline.constant";
import { Prisma, type SyncResource } from "@prisma/client";
import { currentRecordSchema, serializationConflictSchema } from "@/schemas/synchronization.schema";
import { prisma } from "@/lib/prisma";
import type { SubmittedSyncOperation, SynchronizationHandler } from "@/interfaces/synchronization.interface";
import { SynchronizationConflictError, SynchronizationDependencyError, SynchronizationKeyConflictError } from "@/server/errors/synchronization.error";

function isRetryableTransactionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === SYNC_SERVER_MESSAGES.P2002 || error.code === SYNC_SERVER_MESSAGES.P2034;
  }

  return serializationConflictSchema.safeParse(error).success;
}

function savedResponse(
  receipt: { operationId: string; resourceVersion: number; result: Prisma.JsonValue },
  replayed: boolean,
) {
  return {
    operationId: receipt.operationId,
    resourceVersion: receipt.resourceVersion,
    result: receipt.result,
    replayed,
  };
}

async function findReceipt(operationId: string, userId: string, requestHash: string) {
  const receipt = await prisma.synchronizationReceipt.findUnique({ where: { operationId } });

  if (!receipt) {
    return null;
  }

  if (receipt.userId !== userId || receipt.requestHash !== requestHash) {
    throw new SynchronizationKeyConflictError(SYNC_SERVER_MESSAGES.LA_CLAVE_DE_OPERACION_YA_SE_USO_CON_OTRA_CUENTA_O_CON_OTROS_DATOS);
  }

  return savedResponse(receipt, true);
}

export const synchronizationRepository = {
  async applyIdempotently(
    operation: SubmittedSyncOperation,
    resource: SyncResource,
    requestHash: string,
    handler: SynchronizationHandler,
  ) {
    const previousResponse = await findReceipt(operation.operationId, operation.userId, requestHash);

    if (previousResponse) {
      return previousResponse;
    }

    for (let attemptCount = 0; attemptCount < 3; attemptCount += 1) {
      try {
        return await prisma.$transaction(async (transaction) => {
          const concurrentReceipt = await transaction.synchronizationReceipt.findUnique({
            where: { operationId: operation.operationId },
          });

          if (concurrentReceipt) {
            if (concurrentReceipt.userId !== operation.userId || concurrentReceipt.requestHash !== requestHash) {
              throw new SynchronizationKeyConflictError(SYNC_SERVER_MESSAGES.LA_CLAVE_DE_OPERACION_YA_SE_USO_CON_OTRA_CUENTA_O_CON_OTROS_DATOS);
            }

            return savedResponse(concurrentReceipt, true);
          }

          for (const dependencyId of operation.dependencies) {
            const dependencyReceipt = await transaction.synchronizationReceipt.findUnique({ where: { operationId: dependencyId } });

            if (!dependencyReceipt || dependencyReceipt.userId !== operation.userId) {
              throw new SynchronizationDependencyError(dependencyId);
            }
          }

          const applied = await handler.apply(transaction, operation);

          if (applied.type === "conflict") {
            let message: string = SYNC_SERVER_MESSAGES.EL_REGISTRO_CAMBIO_EN_OTRO_DISPOSITIVO;
            const currentRecord = currentRecordSchema.safeParse(applied.current);
            if (currentRecord.success && currentRecord.data.kind === "already-recorded") {
              message = OFFLINE_OPERATION_MESSAGES.ESTE_BENEFICIARIO_YA_TIENE_UN_REGISTRO_CONFIRMADO_EN_EL_PERIODO_REVISA_LOS;
            }
            throw new SynchronizationConflictError(message, applied.resourceVersion, applied.current);
          }

          const result: Prisma.InputJsonValue = applied.result;
          const receipt = await transaction.synchronizationReceipt.create({
            data: {
              operationId: operation.operationId,
              userId: operation.userId,
              resource,
              resourceId: operation.resourceId,
              requestHash,
              resourceVersion: applied.resourceVersion,
              result,
            },
          });

          return savedResponse(receipt, false);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!isRetryableTransactionError(error)) {
          throw error;
        }

        const completedResponse = await findReceipt(operation.operationId, operation.userId, requestHash);

        if (completedResponse) {
          return completedResponse;
        }

        if (attemptCount === 2) {
          throw error;
        }
      }
    }

    throw new Error(SYNC_SERVER_MESSAGES.NO_SE_PUDO_CONFIRMAR_LA_SINCRONIZACION_DESPUES_DE_VARIOS_INTENTOS);
  },
};
