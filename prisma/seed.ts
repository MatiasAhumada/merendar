import { z } from "zod";
import { AccessCapability, UserRole } from "@prisma/client";
import { INITIAL_ACCESS_POLICY } from "../src/constants/access-policy.constant";
import { AUTH } from "../src/constants/auth.constant";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/server/services/auth.service";

async function main() {
  const capabilities = Object.values(AccessCapability);
  const roles = Object.values(UserRole);
  await prisma.roleCapabilityPolicy.createMany({
    data: roles.flatMap((role) => capabilities.map((capability) => ({
      role,
      capability,
      enabled: INITIAL_ACCESS_POLICY[role].includes(capability),
    }))),
    skipDuplicates: true,
  });

  const rawEmail = process.env.PRESIDENT_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? "";
  const rawUsername = process.env.PRESIDENT_BOOTSTRAP_USERNAME?.trim().toLowerCase() ?? "";
  const parsedEmail = rawEmail
    ? z.string().email().max(AUTH.IDENTIFIER_MAX_LENGTH).safeParse(rawEmail)
    : null;
  // Older local setups sometimes put the username in PRESIDENT_BOOTSTRAP_EMAIL.
  const email = parsedEmail?.success ? parsedEmail.data : null;
  const usernameCandidate = rawUsername || (!email ? rawEmail : "");
  const bootstrapSchema = z.object({
    email: z.string().email().max(AUTH.IDENTIFIER_MAX_LENGTH).nullable(),
    username: z
      .string()
      .min(1)
      .max(AUTH.USERNAME_MAX_LENGTH)
      .regex(/^[\p{L}\p{N}._-]+$/u)
      .nullable(),
    name: z.string().trim().min(1),
    password: z.string().min(1).max(AUTH.PASSWORD_MAX_LENGTH),
  }).refine((value) => value.email || value.username, {
    message: "Configurá al menos un correo o nombre de usuario.",
  });
  const bootstrap = bootstrapSchema.safeParse({
    email,
    username: usernameCandidate || null,
    name: process.env.PRESIDENT_BOOTSTRAP_NAME,
    password: process.env.PRESIDENT_BOOTSTRAP_PASSWORD,
  });

  if (!bootstrap.success) {
    throw new Error("Configurá un correo o usuario, PRESIDENT_BOOTSTRAP_NAME y una contraseña no vacía de hasta 128 caracteres.");
  }

  const passwordHash = await hashPassword(bootstrap.data.password);
  const identityFilters = [
    ...(bootstrap.data.email ? [{ email: bootstrap.data.email }] : []),
    ...(bootstrap.data.username ? [{ username: bootstrap.data.username }] : []),
  ];
  const existingUser = await prisma.user.findFirst({ where: { OR: identityFilters } });

  if (!existingUser) {
    await prisma.user.create({
      data: {
        email: bootstrap.data.email,
        username: bootstrap.data.username,
        name: bootstrap.data.name,
        passwordHash,
        role: UserRole.PRESIDENTE,
        isActive: true,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("No se pudo completar el bootstrap del usuario presidente.");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
