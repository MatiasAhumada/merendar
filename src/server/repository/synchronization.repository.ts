import { Prisma, type SyncResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SubmittedSyncOperation, SynchronizationHandler } from "@/interfaces/synchronization.interface";
import type { JsonValue } from "@/types/json-value";

export class SynchronizationConflictError extends Error {
  readonly currentVersion: number;
  readonly current: JsonValue;

  constructor(message: string, currentVersion: number, current: JsonValue) {
    super(message);
    this.name = "SynchronizationConflictError";
    this.currentVersion = currentVersion;
    this.current = current;
  }
}

export class SynchronizationKeyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SynchronizationKeyConflictError";
  }
}

export class SynchronizationDependencyError extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super("El cambio espera a que se sincronice primero un registro relacionado.");
    this.name = "SynchronizationDependencyError";
    this.operationId = operationId;
  }
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
    throw new SynchronizationKeyConflictError("La clave de operación ya se usó con otra cuenta o con otros datos.");
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

    try {
      return await prisma.$transaction(async (transaction) => {
        const concurrentReceipt = await transaction.synchronizationReceipt.findUnique({
          where: { operationId: operation.operationId },
        });

        if (concurrentReceipt) {
          if (concurrentReceipt.userId !== operation.userId || concurrentReceipt.requestHash !== requestHash) {
            throw new SynchronizationKeyConflictError("La clave de operación ya se usó con otra cuenta o con otros datos.");
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
          throw new SynchronizationConflictError("El registro cambió en otro dispositivo.", applied.resourceVersion, applied.current);
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
        const completedResponse = await findReceipt(operation.operationId, operation.userId, requestHash);

        if (completedResponse) {
          return completedResponse;
        }
      }

      throw error;
    }
  },
};
