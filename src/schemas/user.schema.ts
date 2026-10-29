import { USER_VALIDATION_MESSAGES } from "@/constants/user.constant";
import { USER_ROLE_OPTIONS } from "@/constants/user-role.constant";
import { z } from "zod";

export const managedUsersSchema = z.object({
  users: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    role: z.enum(USER_ROLE_OPTIONS).nullable(),
    isActive: z.boolean(),
  })),
});

export const createUserRequestSchema = z.object({
  name: z.string().trim().min(2, USER_VALIDATION_MESSAGES.NAME_INVALID).max(120),
  email: z.email(USER_VALIDATION_MESSAGES.EMAIL_INVALID).transform((email) => email.trim().toLowerCase()),
  role: z.enum(USER_ROLE_OPTIONS),
  password: z.string().min(10, USER_VALIDATION_MESSAGES.PASSWORD_MIN_LENGTH).max(128),
}).strict();

export const updateUserStatusRequestSchema = z.object({ isActive: z.boolean() }).strict();

