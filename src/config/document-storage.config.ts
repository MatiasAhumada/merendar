import { z } from "zod";
import { DOCUMENT_STORAGE_ERROR_MESSAGES } from "@/constants/document-storage.constant";

const documentStorageEnvironmentSchema = z.object({
  R2_ENDPOINT: z.url().startsWith("https://"),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1).default("merendar"),
  R2_PUBLIC_URL: z.union([z.literal(""), z.url().startsWith("https://")]).optional(),
});

export type DocumentStorageConfiguration = z.infer<typeof documentStorageEnvironmentSchema>;

export function getDocumentStorageConfiguration(): DocumentStorageConfiguration {
  const parsedConfiguration = documentStorageEnvironmentSchema.safeParse({
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  });

  if (!parsedConfiguration.success) {
    throw new Error(DOCUMENT_STORAGE_ERROR_MESSAGES.CONFIGURATION_REQUIRED);
  }

  return parsedConfiguration.data;
}
