import { OFFLINE_OPERATION_MESSAGES } from "@/constants/offline.constant";
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
    super(OFFLINE_OPERATION_MESSAGES.EL_CAMBIO_ESPERA_A_QUE_SE_SINCRONICE_PRIMERO_UN_REGISTRO_RELACIONADO);
    this.name = "SynchronizationDependencyError";
    this.operationId = operationId;
  }
}
