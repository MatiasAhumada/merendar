import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getDocumentStorageConfiguration } from "@/config/document-storage.config";
import type { DocumentStorageProvider, StoredDocumentReference } from "@/interfaces/document-storage.interface";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { DOCUMENT_STORAGE_ERROR_MESSAGES } from "@/constants/document-storage.constant";

let client: S3Client | undefined;

function getClient(configuration: ReturnType<typeof getDocumentStorageConfiguration>) {
  if (!client) {
    client = new S3Client({
      endpoint: configuration.R2_ENDPOINT,
      region: "auto",
      credentials: {
        accessKeyId: configuration.R2_ACCESS_KEY_ID,
        secretAccessKey: configuration.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  return client;
}

function hashContent(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

function createReference(bucket: string, objectKey: string, checksum: string, byteSize: number, contentType: string): StoredDocumentReference {
  return { bucket, objectKey, checksum, byteSize, contentType };
}

export const documentStorageProvider: DocumentStorageProvider = {
  async put(input) {
    const configuration = getDocumentStorageConfiguration();
    const storageClient = getClient(configuration);
    const checksum = hashContent(input.content);
    const existingObject = await this.head(input.objectKey);

    if (existingObject) {
      if (existingObject.checksum !== checksum || existingObject.byteSize !== input.content.byteLength) {
        throw new Error(DOCUMENT_STORAGE_ERROR_MESSAGES.OBJECT_KEY_CONFLICT);
      }
      return existingObject;
    }

    try {
      await storageClient.send(new PutObjectCommand({
        Bucket: configuration.R2_BUCKET_NAME,
        Key: input.objectKey,
        Body: input.content,
        ContentType: input.contentType,
        Metadata: { sha256: checksum },
      }));
      const verifiedObject = await this.head(input.objectKey);
      if (!verifiedObject || verifiedObject.checksum !== checksum || verifiedObject.byteSize !== input.content.byteLength) {
        throw new Error(DOCUMENT_STORAGE_ERROR_MESSAGES.INTEGRITY_FAILED);
      }
      return verifiedObject;
    } catch {
      throw new Error(DOCUMENT_STORAGE_ERROR_MESSAGES.UPLOAD_FAILED);
    }
  },

  async get(objectKey, bucketName) {
    const configuration = getDocumentStorageConfiguration();
    try {
      const response = await getClient(configuration).send(new GetObjectCommand({ Bucket: bucketName ?? configuration.R2_BUCKET_NAME, Key: objectKey }));
      if (!response.Body) {
        throw new Error("El objeto no tiene contenido.");
      }
      const content = await response.Body.transformToByteArray();
      const checksum = hashContent(content);
      if (response.Metadata?.sha256 && response.Metadata.sha256 !== checksum) {
        throw new Error("El checksum del objeto no coincide.");
      }
      return content;
    } catch {
      throw new Error("No se pudo leer el documento desde Cloudflare R2.");
    }
  },

  async head(objectKey) {
    const configuration = getDocumentStorageConfiguration();
    try {
      const response = await getClient(configuration).send(new HeadObjectCommand({ Bucket: configuration.R2_BUCKET_NAME, Key: objectKey }));
      return createReference(configuration.R2_BUCKET_NAME, objectKey, response.Metadata?.sha256 ?? "", response.ContentLength ?? 0, response.ContentType ?? "application/octet-stream");
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        return null;
      }
      throw new Error("No se pudo verificar la existencia del documento en Cloudflare R2.");
    }
  },

  async delete(objectKey) {
    const configuration = getDocumentStorageConfiguration();
    try {
      await getClient(configuration).send(new DeleteObjectCommand({ Bucket: configuration.R2_BUCKET_NAME, Key: objectKey }));
    } catch {
      throw new Error("No se pudo eliminar el documento de Cloudflare R2.");
    }
  },
};

export function createDocumentObjectKey(category: string, id: string, checksum: string) {
  return `${category}/${id}/${checksum}.pdf`;
}

export function getDocumentChecksum(content: Uint8Array) {
  return hashContent(content);
}

export async function storeDocumentObject(input: { category: string; id: string; content: Uint8Array; contentType: string }) {
  const checksum = hashContent(input.content);
  try {
    return await documentStorageProvider.put({
      objectKey: createDocumentObjectKey(input.category, input.id, checksum),
      content: input.content,
      contentType: input.contentType,
    });
  } catch (error) {
    const isConfigurationError = error instanceof Error && error.message === DOCUMENT_STORAGE_ERROR_MESSAGES.CONFIGURATION_REQUIRED;
    let message: string = DOCUMENT_STORAGE_ERROR_MESSAGES.UPLOAD_FAILED;
    if (isConfigurationError) {
      message = DOCUMENT_STORAGE_ERROR_MESSAGES.CONFIGURATION_REQUIRED;
    }
    throw new ApiError({ status: 503, message });
  }
}

export async function readDocumentObject(objectKey: string, bucket?: string) {
  try {
    return await documentStorageProvider.get(objectKey, bucket);
  } catch (error) {
    const isConfigurationError = error instanceof Error && error.message === DOCUMENT_STORAGE_ERROR_MESSAGES.CONFIGURATION_REQUIRED;
    let message: string = DOCUMENT_STORAGE_ERROR_MESSAGES.READ_FAILED;
    if (isConfigurationError) {
      message = DOCUMENT_STORAGE_ERROR_MESSAGES.CONFIGURATION_REQUIRED;
    }
    throw new ApiError({ status: 503, message });
  }
}
