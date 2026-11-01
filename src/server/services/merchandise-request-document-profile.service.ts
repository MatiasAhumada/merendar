import { merchandiseRequestDocumentProfileSchema } from "@/schemas/merchandise-request-document.schema";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/utils/handlers/apiError.handler";

const profileId = "default";

export async function getMerchandiseRequestDocumentProfile() {
  const profile = await prisma.merchandiseRequestDocumentProfile.upsert({
    where: { id: profileId },
    create: { id: profileId },
    update: {},
    select: { presidentName: true, updatedAt: true },
  });

  return { ...profile, presidentName: merchandiseRequestDocumentProfileSchema.parse({ presidentName: profile.presidentName }).presidentName };
}

export async function saveMerchandiseRequestDocumentProfile(payload: unknown, userId: string) {
  const parsedProfile = merchandiseRequestDocumentProfileSchema.safeParse(payload);
  if (!parsedProfile.success) {
    throw new ApiError({ status: 400, message: "Ingresá el nombre de la presidenta para guardar la firma institucional." });
  }

  return prisma.merchandiseRequestDocumentProfile.upsert({
    where: { id: profileId },
    create: { id: profileId, presidentName: parsedProfile.data.presidentName, updatedById: userId },
    update: { presidentName: parsedProfile.data.presidentName, updatedById: userId },
    select: { presidentName: true, updatedAt: true },
  });
}
