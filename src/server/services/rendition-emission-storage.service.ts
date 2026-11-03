import { readDocumentObject } from "@/server/services/document-storage.service";
import type { RenditionEmissionSource, RenditionEmissionSourceRecord } from "@/server/repository/rendition-emission.repository";

function copyBytes(content: Uint8Array): Uint8Array<ArrayBuffer> {
  const copiedContent = new Uint8Array(new ArrayBuffer(content.byteLength));
  copiedContent.set(content);
  return copiedContent;
}

async function hydrateStoredPdf<T extends { storageBucket: string; storageKey: string }>(document: T): Promise<Omit<T, "content"> & { content: Uint8Array<ArrayBuffer> }> {
  return { ...document, content: copyBytes(await readDocumentObject(document.storageKey, document.storageBucket)) };
}

export async function hydrateRenditionEmissionSource(source: RenditionEmissionSourceRecord): Promise<RenditionEmissionSource> {
  const [documents, requests] = await Promise.all([
    Promise.all(source.documents.map(hydrateStoredPdf)),
    Promise.all(source.period.requests.map(async (request) => ({
      ...request,
      documents: await Promise.all(request.documents.map(hydrateStoredPdf)),
      issuedDocuments: await Promise.all(request.issuedDocuments.map(hydrateStoredPdf)),
      remittances: await Promise.all(request.remittances.map(async (remittance) => ({
        ...remittance,
        documents: await Promise.all(remittance.documents.map(hydrateStoredPdf)),
      }))),
    }))),
  ]);

  return {
    ...source,
    documents,
    period: { ...source.period, requests },
  };
}
