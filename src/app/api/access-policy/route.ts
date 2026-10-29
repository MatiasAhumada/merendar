

import { PRIVATE_RESPONSE_HEADERS } from "@/constants/http.constant";
import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { AccessCapability, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/constants/auth.constant";
import { ACCESS_CAPABILITY_KEYS } from "@/constants/access-policy.constant";
import { accessPolicyRepository } from "@/server/repository/access-policy.repository";
import { requireAdministrativeCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";
import { updateAccessPolicyRequestSchema } from "@/schemas/access-policy.schema";

const privateHeaders = PRIVATE_RESPONSE_HEADERS;
function isCompletePolicySet(roles: Array<{ role: UserRole; capabilities: AccessCapability[] }>) {
  const uniqueRoles = new Set(roles.map((policy) => policy.role));
  return uniqueRoles.size === Object.values(UserRole).length && Object.values(UserRole).every((role) => uniqueRoles.has(role));
}

export async function GET(request: NextRequest) {
  try {
    await requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "access-policy.manage", USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_PERMISOS);
    const snapshot = await accessPolicyRepository.findManagementSnapshot();
    const policyRecords = snapshot.policies.map((policy) => ({
      role: policy.role,
      capability: policy.capability,
      capabilityKey: ACCESS_CAPABILITY_KEYS[policy.capability],
      enabled: policy.enabled,
    }));
    const usersByRole = Object.values(UserRole).map((role) => ({
      role,
      users: snapshot.users.filter((user) => user.role === role).map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        isActive: user.isActive,
      })),
    }));
    const history = snapshot.changes.map((change) => ({
      role: change.role,
      capabilityKey: ACCESS_CAPABILITY_KEYS[change.capability],
      previousValue: change.previousValue,
      newValue: change.newValue,
      actorName: change.actor.name,
      createdAt: change.createdAt.toISOString(),
    }));
    return NextResponse.json({ policies: policyRecords, usersByRole, history }, { headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: USER_ERROR_MESSAGES.NO_SE_PUDO_CONSULTAR_LA_POLITICA_DE_PERMISOS, isOperational: false }), request });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "access-policy.manage", USER_ERROR_MESSAGES.NO_TENES_PERMISO_PARA_ADMINISTRAR_PERMISOS);
    const parsedBody = updateAccessPolicyRequestSchema.safeParse(await request.json());

    if (!parsedBody.success || !isCompletePolicySet(parsedBody.data.roles)) {
      return NextResponse.json({ error: { message: USER_ERROR_MESSAGES.LA_MATRIZ_DEBE_INCLUIR_UNA_SOLA_CONFIGURACION_COMPLETA_POR_ROL } }, { status: 400, headers: privateHeaders });
    }

    const records = parsedBody.data.roles.flatMap((rolePolicy) => Object.values(AccessCapability).map((capability) => ({
      role: rolePolicy.role,
      capability,
      enabled: rolePolicy.capabilities.includes(capability),
    })));
    await accessPolicyRepository.saveRolePolicies(actor.id, records);
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 409, message: USER_ERROR_MESSAGES.NO_SE_PUDIERON_GUARDAR_LOS_PERMISOS_VOLVE_A_CARGAR_LA_MATRIZ_E_INTENTA }), request });
  }
}
