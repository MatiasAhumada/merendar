import { APPLICATION_ERROR_MESSAGES } from "@/constants/error-messages.constant";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var merendarPrisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(APPLICATION_ERROR_MESSAGES.DATABASE_URL_ES_OBLIGATORIA_PARA_INICIAR_LA_APLICACION);
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const logLevels: Array<"error" | "warn"> = ["error"];

  if (process.env.NODE_ENV === "development") {
    logLevels.push("warn");
  }

  return new PrismaClient({
    adapter,
    log: logLevels,
  });
}

export const prisma = globalThis.merendarPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.merendarPrisma = prisma;

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
