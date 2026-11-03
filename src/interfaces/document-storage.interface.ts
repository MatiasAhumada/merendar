export interface StoredDocumentReference {
  bucket: string;
  objectKey: string;
  checksum: string;
  byteSize: number;
  contentType: string;
}

export interface DocumentStorageProvider {
  put(input: { objectKey: string; content: Uint8Array; contentType: string }): Promise<StoredDocumentReference>;
  get(objectKey: string, bucket?: string): Promise<Uint8Array>;
  head(objectKey: string): Promise<StoredDocumentReference | null>;
  delete(objectKey: string): Promise<void>;
}
