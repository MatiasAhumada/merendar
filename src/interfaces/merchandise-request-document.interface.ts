export type MerchandiseRequestDocumentKind = "MODULES" | "MERENDERO_SUPPLIES";

export interface MerchandiseRequestDocumentTemplate {
  associationName: string;
  resolution: string;
  address: string;
  contact: string;
  recipient: string;
  recipientTitle: string;
  locality: string;
  issueDate: string;
  requestedPeriod: string;
  purpose: string;
  population: string;
  observations: string;
  signatories: Array<{ name: string; title: string }>;
  logoDataUrl: string;
}

export interface MerchandiseRequestDocumentRecord {
  id: string;
  kind: MerchandiseRequestDocumentKind;
  version: number;
  templateVersion: number;
  originalName: string;
  contentType: string;
  createdAt: string;
  snapshot: {
    template: MerchandiseRequestDocumentTemplate;
    request: {
      requestNumber: string;
      requestedAt: string;
      requestedQuantity: number;
      period: { label: string; agency: string };
      items: Array<{ productName: string; presentation: string; unit: string; requestedQuantity: number }>;
    };
  };
}
