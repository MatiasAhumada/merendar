import { ACCESS_CAPABILITY_OPTIONS } from "@/constants/access-policy.constant";
import { USER_ROLE_OPTIONS } from "@/constants/user-role.constant";
import { z } from "zod";

export const policySnapshotSchema = z.object({
  policies: z.array(z.object({ role: z.enum(USER_ROLE_OPTIONS), capability: z.enum(ACCESS_CAPABILITY_OPTIONS), enabled: z.boolean() })),
  usersByRole: z.array(z.object({
    role: z.enum(USER_ROLE_OPTIONS),
    users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), isActive: z.boolean() })),
  })),
  history: z.array(z.object({
    role: z.enum(USER_ROLE_OPTIONS),
    capabilityKey: z.string(),
    previousValue: z.boolean(),
    newValue: z.boolean(),
    actorName: z.string(),
    createdAt: z.string(),
  })),
});

export const updateAccessPolicyRequestSchema = z.object({
  roles: z.array(z.object({
    role: z.enum(USER_ROLE_OPTIONS),
    capabilities: z.array(z.enum(ACCESS_CAPABILITY_OPTIONS)),
  }).strict()).length(USER_ROLE_OPTIONS.length),
}).strict();

