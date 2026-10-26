import { AccessCapability, UserRole } from "@prisma/client";
import { z } from "zod";

export const policySnapshotSchema = z.object({
  policies: z.array(z.object({ role: z.nativeEnum(UserRole), capability: z.nativeEnum(AccessCapability), enabled: z.boolean() })),
  usersByRole: z.array(z.object({
    role: z.nativeEnum(UserRole),
    users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string().nullable(), isActive: z.boolean() })),
  })),
  history: z.array(z.object({
    role: z.nativeEnum(UserRole),
    capabilityKey: z.string(),
    previousValue: z.boolean(),
    newValue: z.boolean(),
    actorName: z.string(),
    createdAt: z.string(),
  })),
});

export type PolicySnapshot = z.infer<typeof policySnapshotSchema>;
