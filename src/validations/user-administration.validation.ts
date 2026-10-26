import { UserRole } from "@prisma/client";
import { z } from "zod";

export const managedUsersSchema = z.object({
  users: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    role: z.nativeEnum(UserRole).nullable(),
    isActive: z.boolean(),
  })),
});

export type ManagedUser = z.infer<typeof managedUsersSchema>["users"][number];
