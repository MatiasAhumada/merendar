import { NextRequest, NextResponse } from "next/server";
import type { SyncResource as PrismaSyncResource } from "@prisma/client";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { createSynchronizationHandlers, synchronizationService } from "@/server/services/synchronization.service";
import { familyPayloadSchema } from "@/validations/family.validation";
import {
  SynchronizationConflictError,
  SynchronizationDependencyError,
  SynchronizationKeyConflictError,
} from "@/server/repository/synchronization.repository";
import type { SyncResource } from "@/types/offline-operation";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import { merchandisePayloadSchema } from "@/validations/merchandise.validation";
import { MerchandiseDocumentError } from "@/server/services/merchandise-synchronization.service";

const synchronizationSchema = z.object({
  operationId: z.uuid(),
  userId: z.string().min(1),
  resource: z.enum(["families", "remittances", "records"]),
  resourceId: z.string().min(1),
  operation: z.enum(["create", "update", "delete"]),
  baseVersion: z.number().int().nonnegative().nullable(),
  dependencies: z.array(z.uuid()).max(100),
  payload: z.json(),
}).strict();

const prismaResourceByClientResource: Record<SyncResource, PrismaSyncResource> = {
  families: "FAMILIES",
  remittances: "REMITTANCES",
  records: "RECORDS",
};

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "invalid_origin", "La solicitud no pertenece a este sitio.");
  }

  const session = await authService.getSession(request.cookies.get(AUTH.SESSION_COOKIE)?.value);

  if (!session) {
    return errorResponse(401, "session_expired", "La sesión venció. Iniciá sesión para sincronizar los cambios pendientes.");
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_body", "El cuerpo de la operación no es válido.");
  }

  const parsedOperation = synchronizationSchema.safeParse(body);

  if (!parsedOperation.success) {
    return errorResponse(400, "invalid_operation", "Revisá los datos del cambio pendiente.");
  }

  if (parsedOperation.data.userId !== session.user.id) {
    return errorResponse(403, "account_changed", "El cambio pertenece a otra cuenta y no se enviará con este usuario.");
  }

  if (parsedOperation.data.resource === "families") {
    const baseVersionValidation = z.null().safeParse(parsedOperation.data.baseVersion);

    if (parsedOperation.data.operation !== "create" || !baseVersionValidation.success) {
      return errorResponse(400, "invalid_family_operation", "El padrón solo permite sincronizar altas nuevas.");
    }

    const parsedFamilyPayload = familyPayloadSchema.safeParse(parsedOperation.data.payload);

    if (!parsedFamilyPayload.success) {
      return errorResponse(400, "invalid_family_payload", "Revisá los datos de la familia antes de sincronizar.", {
        details: parsedFamilyPayload.error.flatten().fieldErrors,
      });
    }
  }

  if (parsedOperation.data.resource === "remittances") {
    let rawPayload: unknown = parsedOperation.data.payload;

    // Recover operations created by the earlier client serializer, which
    // stored the JSON representation one level too deep as a string.
    if (typeof rawPayload === "string") {
      try {
        rawPayload = JSON.parse(rawPayload);
      } catch {
        return errorResponse(400, "invalid_merchandise_operation", "Revisá los datos de la recepción pendiente.");
      }
    }

    const parsedPayload = merchandisePayloadSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      const details = parsedPayload.error.issues.map((issue) => `${issue.path.join(".") || "datos"}: ${issue.message}`).join("; ");
      return errorResponse(400, "invalid_merchandise_operation", `Revisá los datos de la recepción pendiente. ${details}`);
    }

    if (parsedPayload.data.id !== parsedOperation.data.resourceId) {
      return errorResponse(400, "invalid_merchandise_operation", "El identificador del borrador no coincide con los datos guardados.");
    }

    parsedOperation.data.payload = parsedPayload.data;
  }

  const handlers = createSynchronizationHandlers();
  const resource = prismaResourceByClientResource[parsedOperation.data.resource];
  const handler = handlers[resource];

  if (!handler) {
    return errorResponse(501, "resource_adapter_unavailable", "La vista todavía no habilitó la sincronización de este tipo de cambio.");
  }

  if (!handler.allowedRoles.includes(session.user.role)) {
    return errorResponse(403, "permission_revoked", "La cuenta ya no tiene permiso para sincronizar este cambio.");
  }

  const operation: SubmittedSyncOperation = {
    operationId: parsedOperation.data.operationId,
    userId: session.user.id,
    resource: parsedOperation.data.resource,
    resourceId: parsedOperation.data.resourceId,
    operation: parsedOperation.data.operation,
    baseVersion: parsedOperation.data.baseVersion,
    dependencies: parsedOperation.data.dependencies,
    payload: parsedOperation.data.payload,
  };

  try {
    const result = await synchronizationService.apply(operation, resource, handler);
    return NextResponse.json(result, { status: 200, headers: privateHeaders });
  } catch (error) {
    if (error instanceof MerchandiseDocumentError) {
      return errorResponse(400, "invalid_merchandise_operation", error.message);
    }

    if (error instanceof SynchronizationConflictError) {
      return errorResponse(409, "version_conflict", error.message, {
        currentVersion: error.currentVersion,
        current: error.current,
      });
    }

    if (error instanceof SynchronizationKeyConflictError) {
      return errorResponse(409, "operation_key_reused", error.message);
    }

    if (error instanceof SynchronizationDependencyError) {
      return errorResponse(409, "dependency_not_ready", error.message, { operationId: error.operationId });
    }

    return errorResponse(500, "synchronization_failed", "No se pudo guardar el cambio en el servidor.");
  }
}
