import { AccessCapability, UserRole } from "@prisma/client";
import { ACCESS_CAPABILITY_KEYS } from "@/constants/access-policy.constant";
import { authService } from "@/server/services/auth.service";
import { accessPolicyRepository } from "@/server/repository/access-policy.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";

const reservedAdministrativeCapabilities = new Set(["users.manage", "access-policy.manage"]);

export async function getEffectiveCapabilities(role: UserRole) {
  const capabilities = await accessPolicyRepository.findEnabledCapabilities(role);
  const effectiveCapabilities = capabilities.map((capability) => ACCESS_CAPABILITY_KEYS[capability]);

  if (role === UserRole.PRESIDENTE) {
    return [...effectiveCapabilities, "users.manage", "access-policy.manage"];
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
  capabilityKey: "users.manage" | "access-policy.manage",
  forbiddenMessage: string,
) {
  return requireCapability(token, capabilityKey, "Iniciá sesión para continuar", forbiddenMessage);
}
