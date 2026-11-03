import { USER_ERROR_MESSAGES } from "@/constants/user.constant";
import { AccessCapability, UserRole } from "@prisma/client";
import { ACCESS_CAPABILITY_KEYS, RESERVED_ACCESS_CAPABILITY_KEYS } from "@/constants/access-policy.constant";
import { authService } from "@/server/services/auth.service";
import { accessPolicyRepository } from "@/server/repository/access-policy.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";

const reservedAdministrativeCapabilities = new Set<string>(RESERVED_ACCESS_CAPABILITY_KEYS);

export async function getEffectiveCapabilities(role: UserRole) {
  const capabilities = await accessPolicyRepository.findEnabledCapabilities(role);
  const effectiveCapabilities = capabilities.map((capability) => ACCESS_CAPABILITY_KEYS[capability]);

  if (role === UserRole.PRESIDENTE) {
    return [...effectiveCapabilities, ...RESERVED_ACCESS_CAPABILITY_KEYS];
  }

  return effectiveCapabilities;
}

export async function hasEffectiveCapability(role: UserRole, capabilityKey: string) {
  if (reservedAdministrativeCapabilities.has(capabilityKey)) {
    return role === UserRole.PRESIDENTE;
  }

  const capability = Object.values(AccessCapability).find((candidate) => ACCESS_CAPABILITY_KEYS[candidate] === capabilityKey);

  if (!capability) {
    return false;
  }

  const grantedCapabilities = await accessPolicyRepository.findEnabledCapabilities(role);
  return grantedCapabilities.includes(capability);
}

export async function requireCapability(
  token: string | undefined,
  capabilityKey: string,
  unauthenticatedMessage: string,
  forbiddenMessage: string,
) {
  const session = await authService.getSession(token);

  if (!session) {
    throw new ApiError({ status: 401, message: unauthenticatedMessage });
  }

  const capabilityAllowed = await hasEffectiveCapability(session.user.role, capabilityKey);

  if (!capabilityAllowed) {
    throw new ApiError({ status: 403, message: forbiddenMessage });
  }

  return session.user;
}

export async function requireAdministrativeCapability(
  token: string | undefined,
  capabilityKey: (typeof RESERVED_ACCESS_CAPABILITY_KEYS)[number],
  forbiddenMessage: string,
) {
  return requireCapability(token, capabilityKey, USER_ERROR_MESSAGES.INICIA_SESION_PARA_CONTINUAR, forbiddenMessage);
}

export async function getAccessPolicyManagement() {
  const snapshot = await accessPolicyRepository.findManagementSnapshot();
  const policies = snapshot.policies.map((policy) => ({
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

  return { policies, usersByRole, history };
}

export async function saveAccessPolicy(
  actorId: string,
  rolePolicies: Array<{ role: UserRole; capabilities: AccessCapability[] }>,
) {
  const records = rolePolicies.flatMap((rolePolicy) => Object.values(AccessCapability).map((capability) => ({
    role: rolePolicy.role,
    capability,
    enabled: rolePolicy.capabilities.includes(capability),
  })));

  await accessPolicyRepository.saveRolePolicies(actorId, records);
}
