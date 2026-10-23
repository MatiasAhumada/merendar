import { NextRequest, NextResponse } from "next/server";
import type { SyncResource as PrismaSyncResource } from "@prisma/client";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { createSynchronizationHandlers, synchronizationService } from "@/server/services/synchronization.service";
import { familyMemberChangeSchema, familyPayloadSchema } from "@/validations/family.validation";
import {
  SynchronizationConflictError,
  SynchronizationDependencyError,
  SynchronizationKeyConflictError,
} from "@/server/repository/synchronization.repository";
import type { SyncResource } from "@/types/offline-operation";
import type { SubmittedSyncOperation } from "@/interfaces/synchronization.interface";
import type { JsonValue } from "@/types/json-value";
import {
  merchandiseCancellationPayloadSchema,
  merchandisePayloadSchema,
  merchandiseUpdatePayloadSchema,
} from "@/validations/merchandise.validation";
import { MerchandiseDocumentError } from "@/server/services/merchandise-synchronization.service";
import { beneficiarySheetDraftSchema, distributionRecordPayloadSchema } from "@/validations/record.validation";
import { renditionSynchronizationPayloadSchema } from "@/validations/rendition.validation";
import { RenditionDocumentError } from "@/server/services/rendition-synchronization.service";
import { RecordSynchronizationError } from "@/server/services/record-synchronization.service";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";

const synchronizationSchema = z.object({
  operationId: z.uuid(),
  userId: z.string().min(1),
  resource: z.enum(["families", "remittances", "records", "renditions"]),
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
  renditions: "RENDITIONS",
};

const capabilityByResource: Record<PrismaSyncResource, string> = {
  FAMILIES: "families.write",
  REMITTANCES: "merchandise.write",
  RECORDS: "delivery.write",
  RENDITIONS: "renditions.write",
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
    if (parsedOperation.data.operation === "create") {
      const baseVersionValidation = z.null().safeParse(parsedOperation.data.baseVersion);

      if (!baseVersionValidation.success) {
        return errorResponse(400, "invalid_family_operation", "El alta de familia no tiene una versión base válida.");
      }

      const parsedFamilyPayload = familyPayloadSchema.safeParse(parsedOperation.data.payload);

      if (!parsedFamilyPayload.success) {
        return errorResponse(400, "invalid_family_payload", "Revisá los datos de la familia antes de sincronizar.", {
          details: parsedFamilyPayload.error.flatten().fieldErrors,
        });
      }

      parsedOperation.data.payload = parsedFamilyPayload.data;
    } else if (parsedOperation.data.operation === "update" && z.number().int().nonnegative().safeParse(parsedOperation.data.baseVersion).success) {
      const parsedMemberChange = familyMemberChangeSchema.safeParse(parsedOperation.data.payload);

      if (!parsedMemberChange.success) {
        return errorResponse(400, "invalid_family_member_operation", "Revisá los datos del integrante antes de sincronizar.", {
          details: parsedMemberChange.error.flatten().fieldErrors,
        });
      }

      parsedOperation.data.payload = parsedMemberChange.data;
    } else {
      return errorResponse(400, "invalid_family_operation", "El padrón solo permite altas o cambios de integrantes.");
    }
  }

  if (parsedOperation.data.resource === "remittances") {
    let rawPayload: unknown = parsedOperation.data.payload;

    // Recover operations created by the earlier client serializer, which
    // stored the JSON representation one level too deep as a string.
    const serializedPayload = z.string().safeParse(rawPayload);

    if (serializedPayload.success) {
      try {
        rawPayload = JSON.parse(serializedPayload.data);
      } catch {
        return errorResponse(400, "invalid_merchandise_operation", "Revisá los datos de la recepción pendiente.");
      }
    }

    let normalizedPayload: JsonValue;
    let merchandiseId: string;

    if (parsedOperation.data.operation === "create" && z.null().safeParse(parsedOperation.data.baseVersion).success) {
      const parsedPayload = merchandisePayloadSchema.safeParse(rawPayload);

      if (!parsedPayload.success) {
        return errorResponse(400, "invalid_merchandise_operation", "Revisá los datos de la recepción pendiente.");
      }

      normalizedPayload = parsedPayload.data;
      merchandiseId = parsedPayload.data.id;
    } else if (parsedOperation.data.operation === "update" && z.number().int().nonnegative().safeParse(parsedOperation.data.baseVersion).success) {
      const parsedPayload = merchandiseUpdatePayloadSchema.safeParse(rawPayload);

      if (!parsedPayload.success) {
        return errorResponse(400, "invalid_merchandise_operation", "Revisá los datos de la corrección pendiente.");
      }

      normalizedPayload = parsedPayload.data;
      merchandiseId = parsedPayload.data.id;
    } else if (parsedOperation.data.operation === "delete" && z.number().int().nonnegative().safeParse(parsedOperation.data.baseVersion).success) {
      const parsedPayload = merchandiseCancellationPayloadSchema.safeParse(rawPayload);

      if (!parsedPayload.success) {
        return errorResponse(400, "invalid_merchandise_operation", "Revisá los datos de la anulación pendiente.");
      }

      normalizedPayload = parsedPayload.data;
      merchandiseId = parsedPayload.data.id;
    } else {
      return errorResponse(400, "invalid_merchandise_operation", "El cambio de mercadería no tiene una operación o versión base válida.");
    }

    if (merchandiseId !== parsedOperation.data.resourceId) {
      return errorResponse(400, "invalid_merchandise_operation", "El identificador del borrador no coincide con los datos guardados.");
    }

    parsedOperation.data.payload = normalizedPayload;
  }

  if (parsedOperation.data.resource === "records") {
    const validBaseVersion = z.null().safeParse(parsedOperation.data.baseVersion);
    const parsedRecordPayload = distributionRecordPayloadSchema.safeParse(parsedOperation.data.payload);
    const parsedSheetDraft = beneficiarySheetDraftSchema.safeParse(parsedOperation.data.payload);

    if (parsedRecordPayload.success && parsedRecordPayload.data.id === parsedOperation.data.resourceId) {
      parsedOperation.data.payload = parsedRecordPayload.data;
    } else if (parsedSheetDraft.success && parsedSheetDraft.data.id === parsedOperation.data.resourceId) {
      parsedOperation.data.payload = parsedSheetDraft.data;
    } else {
      return errorResponse(400, "invalid_record_operation", "Revisá el registro o la planilla local antes de sincronizar.");
    }

    if (parsedOperation.data.operation !== "create" || !validBaseVersion.success) {
      return errorResponse(400, "invalid_record_operation", "Los registros y las planillas locales solo admiten altas nuevas.");
    }
  }

  if (parsedOperation.data.resource === "renditions") {
    const parsedPayload = renditionSynchronizationPayloadSchema.safeParse(parsedOperation.data.payload);
    const validBaseVersion = z.null().safeParse(parsedOperation.data.baseVersion);

    if (!parsedPayload.success || parsedPayload.data.id !== parsedOperation.data.resourceId) {
      return errorResponse(400, "invalid_rendition_operation", "Revisá los archivos o la revisión pendiente antes de sincronizar.");
    }

    if (parsedOperation.data.operation !== "create" || !validBaseVersion.success) {
      return errorResponse(400, "invalid_rendition_operation", "Los cambios de rendición solo admiten nuevas cargas o revisiones.");
    }

    parsedOperation.data.payload = parsedPayload.data;
  }

  const handlers = createSynchronizationHandlers();
  const resource = prismaResourceByClientResource[parsedOperation.data.resource];
  const handler = handlers[resource];

  if (!handler) {
    return errorResponse(501, "resource_adapter_unavailable", "La vista todavía no habilitó la sincronización de este tipo de cambio.");
  }

  let requiredCapability = capabilityByResource[resource];
  if (resource === "RENDITIONS") {
    const parsedPayload = renditionSynchronizationPayloadSchema.safeParse(parsedOperation.data.payload);
    if (parsedPayload.success && parsedPayload.data.kind === "rendition_review") {
      requiredCapability = "renditions.review";
    }
  }
  const capabilityAllowed = await hasEffectiveCapability(session.user.role, requiredCapability);

  if (!capabilityAllowed) {
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
    if (error instanceof RecordSynchronizationError) {
      return errorResponse(error.status, error.code, error.message);
    }

    if (error instanceof MerchandiseDocumentError) {
      return errorResponse(400, "invalid_merchandise_operation", error.message);
    }

    if (error instanceof RenditionDocumentError) {
      return errorResponse(error.status, "invalid_rendition_operation", error.message);
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
