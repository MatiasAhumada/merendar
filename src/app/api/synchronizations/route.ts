

import { OFFLINE_OPERATION_MESSAGES } from "@/constants/offline.constant";
import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { NextRequest, NextResponse } from "next/server";

import { AUTH } from "@/constants/auth.constant";
import { authService } from "@/server/services/auth.service";
import { isSameOriginRequest } from "@/server/services/origin.service";
import { createSynchronizationHandlers, synchronizationService } from "@/server/services/synchronization.service";
import { familyDeactivationTargetSchema, familyMemberChangeSchema, familyPayloadSchema } from "@/schemas/family.schema";
import { MerchandiseDocumentError } from "@/server/services/merchandise-synchronization.service";
import { beneficiarySheetDraftSchema, distributionRecordPayloadSchema } from "@/schemas/record.schema";
import { renditionSynchronizationPayloadSchema } from "@/schemas/rendition.schema";
import { RenditionDocumentError } from "@/server/services/rendition-synchronization.service";
import { RecordSynchronizationError } from "@/server/services/record-synchronization.service";
import { FamilyDeactivationSyncError } from "@/server/services/family-synchronization.service";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";
import { synchronizationRequestSchema } from "@/schemas/synchronization.schema";
import { nonNegativeIntegerSchema, nullableSchema } from "@/schemas/offline.schema";
import { stringSchema } from "@/schemas/common.schema";
import type { SyncResource as PrismaSyncResource } from "@prisma/client";

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
} from "@/schemas/merchandise.schema";

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

const privateHeaders = PRIVATE_RESPONSE_HEADERS;

function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "invalid_origin", OFFLINE_OPERATION_MESSAGES.LA_SOLICITUD_NO_PERTENECE_A_ESTE_SITIO);
  }

  const session = await authService.getSession(request.cookies.get(AUTH.SESSION_COOKIE)?.value);

  if (!session) {
    return errorResponse(401, "session_expired", OFFLINE_OPERATION_MESSAGES.LA_SESION_VENCIO_INICIA_SESION_PARA_SINCRONIZAR_LOS_CAMBIOS_PENDIENTES);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_body", OFFLINE_OPERATION_MESSAGES.EL_CUERPO_DE_LA_OPERACION_NO_ES_VALIDO);
  }

  const parsedOperation = synchronizationRequestSchema.safeParse(body);

  if (!parsedOperation.success) {
    return errorResponse(400, "invalid_operation", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_DATOS_DEL_CAMBIO_PENDIENTE);
  }

  if (parsedOperation.data.userId !== session.user.id) {
    return errorResponse(403, "account_changed", OFFLINE_OPERATION_MESSAGES.EL_CAMBIO_PERTENECE_A_OTRA_CUENTA_Y_NO_SE_ENVIARA_CON_ESTE_USUARIO);
  }

  if (parsedOperation.data.resource === "families") {
    if (parsedOperation.data.operation === "create") {
      const baseVersionValidation = nullableSchema.safeParse(parsedOperation.data.baseVersion);

      if (!baseVersionValidation.success) {
        return errorResponse(400, "invalid_family_operation", OFFLINE_OPERATION_MESSAGES.EL_ALTA_DE_FAMILIA_NO_TIENE_UNA_VERSION_BASE_VALIDA);
      }

      const parsedFamilyPayload = familyPayloadSchema.safeParse(parsedOperation.data.payload);

      if (!parsedFamilyPayload.success) {
        return errorResponse(400, "invalid_family_payload", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_DATOS_DE_LA_FAMILIA_ANTES_DE_SINCRONIZAR, {
          details: parsedFamilyPayload.error.flatten().fieldErrors,
        });
      }

      parsedOperation.data.payload = parsedFamilyPayload.data;
    } else if (parsedOperation.data.operation === "update" && nonNegativeIntegerSchema.safeParse(parsedOperation.data.baseVersion).success) {
      const parsedMemberChange = familyMemberChangeSchema.safeParse(parsedOperation.data.payload);

      if (!parsedMemberChange.success) {
        return errorResponse(400, "invalid_family_member_operation", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_DATOS_DEL_INTEGRANTE_ANTES_DE_SINCRONIZAR, {
          details: parsedMemberChange.error.flatten().fieldErrors,
        });
      }

      parsedOperation.data.payload = parsedMemberChange.data;
    } else if (parsedOperation.data.operation === "delete" && nonNegativeIntegerSchema.safeParse(parsedOperation.data.baseVersion).success) {
      const parsedTarget = familyDeactivationTargetSchema.safeParse(parsedOperation.data.payload);

      if (!parsedTarget.success) {
        return errorResponse(400, "invalid_family_deactivation", OFFLINE_OPERATION_MESSAGES.REVISA_EL_DESTINO_DE_LA_BAJA_FAMILIAR_PENDIENTE);
      }

      parsedOperation.data.payload = parsedTarget.data;
    } else {
      return errorResponse(400, "invalid_family_operation", OFFLINE_OPERATION_MESSAGES.EL_PADRON_SOLO_PERMITE_ALTAS_O_CAMBIOS_DE_INTEGRANTES);
    }
  }

  if (parsedOperation.data.resource === "remittances") {
    let rawPayload: unknown = parsedOperation.data.payload;

    // Recover operations created by the earlier client serializer, which
    // stored the JSON representation one level too deep as a string.
    const serializedPayload = stringSchema.safeParse(rawPayload);

    if (serializedPayload.success) {
      try {
        rawPayload = JSON.parse(serializedPayload.data);
      } catch {
        return errorResponse(400, "invalid_merchandise_operation", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_DATOS_DE_LA_RECEPCION_PENDIENTE);
      }
    }

    let normalizedPayload: JsonValue;
    let merchandiseId: string;

    if (parsedOperation.data.operation === "create" && nullableSchema.safeParse(parsedOperation.data.baseVersion).success) {
      const parsedPayload = merchandisePayloadSchema.safeParse(rawPayload);

      if (!parsedPayload.success) {
        return errorResponse(400, "invalid_merchandise_operation", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_DATOS_DE_LA_RECEPCION_PENDIENTE);
      }

      normalizedPayload = parsedPayload.data;
      merchandiseId = parsedPayload.data.id;
    } else if (parsedOperation.data.operation === "update" && nonNegativeIntegerSchema.safeParse(parsedOperation.data.baseVersion).success) {
      const parsedPayload = merchandiseUpdatePayloadSchema.safeParse(rawPayload);

      if (!parsedPayload.success) {
        return errorResponse(400, "invalid_merchandise_operation", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_DATOS_DE_LA_CORRECCION_PENDIENTE);
      }

      normalizedPayload = parsedPayload.data;
      merchandiseId = parsedPayload.data.id;
    } else if (parsedOperation.data.operation === "delete" && nonNegativeIntegerSchema.safeParse(parsedOperation.data.baseVersion).success) {
      const parsedPayload = merchandiseCancellationPayloadSchema.safeParse(rawPayload);

      if (!parsedPayload.success) {
        return errorResponse(400, "invalid_merchandise_operation", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_DATOS_DE_LA_ANULACION_PENDIENTE);
      }

      normalizedPayload = parsedPayload.data;
      merchandiseId = parsedPayload.data.id;
    } else {
      return errorResponse(400, "invalid_merchandise_operation", OFFLINE_OPERATION_MESSAGES.EL_CAMBIO_DE_MERCADERIA_NO_TIENE_UNA_OPERACION_O_VERSION_BASE_VALIDA);
    }

    if (merchandiseId !== parsedOperation.data.resourceId) {
      return errorResponse(400, "invalid_merchandise_operation", OFFLINE_OPERATION_MESSAGES.EL_IDENTIFICADOR_DEL_BORRADOR_NO_COINCIDE_CON_LOS_DATOS_GUARDADOS);
    }

    parsedOperation.data.payload = normalizedPayload;
  }

  if (parsedOperation.data.resource === "records") {
    const validBaseVersion = nullableSchema.safeParse(parsedOperation.data.baseVersion);
    const parsedRecordPayload = distributionRecordPayloadSchema.safeParse(parsedOperation.data.payload);
    const parsedSheetDraft = beneficiarySheetDraftSchema.safeParse(parsedOperation.data.payload);

    if (parsedRecordPayload.success && parsedRecordPayload.data.id === parsedOperation.data.resourceId) {
      parsedOperation.data.payload = parsedRecordPayload.data;
    } else if (parsedSheetDraft.success && parsedSheetDraft.data.id === parsedOperation.data.resourceId) {
      parsedOperation.data.payload = parsedSheetDraft.data;
    } else {
      return errorResponse(400, "invalid_record_operation", OFFLINE_OPERATION_MESSAGES.REVISA_EL_REGISTRO_O_LA_PLANILLA_LOCAL_ANTES_DE_SINCRONIZAR);
    }

    if (parsedOperation.data.operation !== "create" || !validBaseVersion.success) {
      return errorResponse(400, "invalid_record_operation", OFFLINE_OPERATION_MESSAGES.LOS_REGISTROS_Y_LAS_PLANILLAS_LOCALES_SOLO_ADMITEN_ALTAS_NUEVAS);
    }
  }

  if (parsedOperation.data.resource === "renditions") {
    const parsedPayload = renditionSynchronizationPayloadSchema.safeParse(parsedOperation.data.payload);
    const validBaseVersion = nullableSchema.safeParse(parsedOperation.data.baseVersion);

    if (!parsedPayload.success || parsedPayload.data.id !== parsedOperation.data.resourceId) {
      return errorResponse(400, "invalid_rendition_operation", OFFLINE_OPERATION_MESSAGES.REVISA_LOS_ARCHIVOS_O_LA_REVISION_PENDIENTE_ANTES_DE_SINCRONIZAR);
    }

    if (parsedOperation.data.operation !== "create" || !validBaseVersion.success) {
      return errorResponse(400, "invalid_rendition_operation", OFFLINE_OPERATION_MESSAGES.LOS_CAMBIOS_DE_RENDICION_SOLO_ADMITEN_NUEVAS_CARGAS_O_REVISIONES);
    }

    parsedOperation.data.payload = parsedPayload.data;
  }

  const handlers = createSynchronizationHandlers();
  const resource = prismaResourceByClientResource[parsedOperation.data.resource];
  const handler = handlers[resource];

  if (!handler) {
    return errorResponse(501, "resource_adapter_unavailable", OFFLINE_OPERATION_MESSAGES.LA_VISTA_TODAVIA_NO_HABILITO_LA_SINCRONIZACION_DE_ESTE_TIPO_DE_CAMBIO);
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
    return errorResponse(403, "permission_revoked", OFFLINE_OPERATION_MESSAGES.LA_CUENTA_YA_NO_TIENE_PERMISO_PARA_SINCRONIZAR_ESTE_CAMBIO);
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
    if (error instanceof FamilyDeactivationSyncError) {
      return errorResponse(409, error.code, error.message);
    }

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

    return errorResponse(500, "synchronization_failed", OFFLINE_OPERATION_MESSAGES.NO_SE_PUDO_GUARDAR_EL_CAMBIO_EN_EL_SERVIDOR);
  }
}
