import { AccessCapability, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH } from "@/constants/auth.constant";
import { ACCESS_CAPABILITY_KEYS } from "@/constants/access-policy.constant";
import { accessPolicyRepository } from "@/server/repository/access-policy.repository";
import { requireAdministrativeCapability } from "@/server/services/access-policy.service";
import apiErrorHandler, { ApiError } from "@/utils/handlers/apiError.handler";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };
const policySchema = z.object({
  roles: z.array(z.object({
    role: z.enum(UserRole),
    capabilities: z.array(z.enum(AccessCapability)),
  }).strict()).length(Object.values(UserRole).length),
}).strict();

function isCompletePolicySet(roles: Array<{ role: UserRole; capabilities: AccessCapability[] }>) {
  const uniqueRoles = new Set(roles.map((policy) => policy.role));
  return uniqueRoles.size === Object.values(UserRole).length && Object.values(UserRole).every((role) => uniqueRoles.has(role));
}

export async function GET(request: NextRequest) {
  try {
    await requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "access-policy.manage", "No tenés permiso para administrar permisos");
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
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 500, message: "No se pudo consultar la política de permisos", isOperational: false }), request });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAdministrativeCapability(request.cookies.get(AUTH.SESSION_COOKIE)?.value, "access-policy.manage", "No tenés permiso para administrar permisos");
    const parsedBody = policySchema.safeParse(await request.json());

    if (!parsedBody.success || !isCompletePolicySet(parsedBody.data.roles)) {
      return NextResponse.json({ error: { message: "La matriz debe incluir una sola configuración completa por rol" } }, { status: 400, headers: privateHeaders });
    }

    const records = parsedBody.data.roles.flatMap((rolePolicy) => Object.values(AccessCapability).map((capability) => ({
      role: rolePolicy.role,
      capability,
      enabled: rolePolicy.capabilities.includes(capability),
    })));
    await accessPolicyRepository.saveRolePolicies(actor.id, records);
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch (error) {
    return apiErrorHandler({ error: error instanceof ApiError ? error : new ApiError({ status: 409, message: "No se pudieron guardar los permisos. Volvé a cargar la matriz e intentá otra vez." }), request });
  }
}
