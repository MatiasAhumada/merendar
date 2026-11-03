import { API_ROUTES } from "@/constants/routes.constant";
import type { MerchandiseRequestDocumentProfile } from "@/interfaces/merchandise-request-document.interface";
import { merchandiseRequestDocumentProfileSchema } from "@/schemas/merchandise-request-document.schema";
import { z } from "zod";
import clientAxios from "@/utils/clientAxios.util";

const profileResponseSchema = z.object({
  profile: merchandiseRequestDocumentProfileSchema.extend({ updatedAt: z.iso.datetime() }),
}).strict();

export async function getMerchandiseRequestDocumentProfile() {
  const response = await clientAxios.get<unknown>(API_ROUTES.MERCHANDISE_REQUEST_DOCUMENT_PROFILE);
  return profileResponseSchema.parse(response.data).profile;
}

export async function saveMerchandiseRequestDocumentProfile(presidentName: string): Promise<MerchandiseRequestDocumentProfile> {
  const response = await clientAxios.put<unknown>(API_ROUTES.MERCHANDISE_REQUEST_DOCUMENT_PROFILE, { presidentName });
  return profileResponseSchema.parse(response.data).profile;
}
