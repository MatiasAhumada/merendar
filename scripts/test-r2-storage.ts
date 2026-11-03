import "dotenv/config";
import { randomUUID } from "node:crypto";
import axios from "axios";
import { getDocumentStorageConfiguration } from "@/config/document-storage.config";
import { documentStorageProvider, getDocumentChecksum } from "@/server/services/document-storage.service";

if (!process.argv.includes("--run")) {
  throw new Error("Usá pnpm test:r2-storage para crear y limpiar un objeto efímero bajo el prefijo de pruebas aislado.");
}

async function main() {
  const identifier = randomUUID();
  const objectKey = `codex-r2-tests/${identifier}/documento-sintetico.pdf`;
  const content = new TextEncoder().encode(`%PDF-1.7\nMerendar R2 integration ${identifier}\n%%EOF`);
  const expectedChecksum = getDocumentChecksum(content);

  try {
    const stored = await documentStorageProvider.put({ objectKey, content, contentType: "application/pdf" });
    if (stored.checksum !== expectedChecksum || stored.byteSize !== content.byteLength) {
      throw new Error("R2 devolvió metadatos diferentes al contenido sintético.");
    }
    const downloaded = await documentStorageProvider.get(objectKey);
    if (getDocumentChecksum(downloaded) !== expectedChecksum) {
      throw new Error("El checksum de descarga desde R2 no coincide.");
    }
    const verified = await documentStorageProvider.head(objectKey);
    if (!verified || verified.checksum !== expectedChecksum) {
      throw new Error("No se pudo verificar el objeto privado en R2.");
    }
    const configuration = getDocumentStorageConfiguration();
    const anonymousObjectUrl = new URL(`${configuration.R2_BUCKET_NAME}/${objectKey}`, `${configuration.R2_ENDPOINT.replace(/\/$/, "")}/`);
    const anonymousResponse = await axios.get(anonymousObjectUrl.toString(), { validateStatus: () => true, timeout: 10_000, maxContentLength: 1_000_000 });
    if (anonymousResponse.status < 400 || anonymousResponse.status >= 500) {
      throw new Error(`La lectura anónima del objeto sintético devolvió HTTP ${anonymousResponse.status}.`);
    }
    console.log(`R2 OK: bucket configurado, objeto privado, ${stored.byteSize} bytes, sha256 ${expectedChecksum.slice(0, 12)}…`);
  } finally {
    await documentStorageProvider.delete(objectKey);
  }

  const removedObject = await documentStorageProvider.head(objectKey);
  if (removedObject) {
    throw new Error("El objeto sintético de R2 no se eliminó al finalizar la prueba.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
