import { AUTH } from "@/constants/auth.constant";
import { USER_ROLE_OPTIONS } from "@/constants/user-role.constant";
import { z } from "zod";

export const loginRequestSchema = z.object({
  identifier: z.string().trim().min(1).max(AUTH.IDENTIFIER_MAX_LENGTH),
  password: z.string().min(1).max(AUTH.PASSWORD_MAX_LENGTH),
}).strict();

export const loginResponseSchema = z.object({
  capabilities: z.array(z.string()),
});

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().nullable(),
    username: z.string().nullable(),
    role: z.enum(USER_ROLE_OPTIONS),
  }),
  expiresAt: z.iso.datetime(),
  capabilities: z.array(z.string()),
});

export const userRoleSchema = z.enum(USER_ROLE_OPTIONS);
