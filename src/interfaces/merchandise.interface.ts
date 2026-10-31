import type { RenditionRecord } from "@/interfaces/rendition.interface";
import type { MerchandiseRequestDocumentRecord } from "@/interfaces/merchandise-request-document.interface";

export type MerchandiseDestination = "FAMILIES" | "MERENDERO";

export interface MerchandiseDocumentSummary {
  id: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface MerchandiseRemittanceRecord {
  id: string;
  version: number;
  requestId: string;
  quotaId: string;
  remittanceNumber: string;
  receivedAt: string;
  receivedQuantity: number;
  items: Array<{ id: string; quotaItemId: string; receivedQuantity: number }>;
  responsibleName: string;
  notes: string | null;
  status: "VIGENTE" | "ANULADO";
  createdBy: { id: string; name: string };
  documents: MerchandiseDocumentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface MerchandiseQuotaRecord {
  id: string;
  version: number;
  requestId: string;
  approvedQuantity: number;
  items: Array<{ id: string; requestItemId: string; authorizedQuantity: number }>;
  approvedAt: string;
  notes: string | null;
  approvedBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface MerchandiseRequestRecord {
  id: string;
  version: number;
  periodId: string;
  requestNumber: string;
  requestedAt: string;
  requestedQuantity: number;
  item: { id: string; productName: string; presentation: string; unit: string; requestedQuantity: number } | null;
  status: "PENDIENTE" | "APROBADA" | "RECHAZADA" | "CANCELADA";
  notes: string | null;
  createdBy: { id: string; name: string };
  quota: MerchandiseQuotaRecord | null;
  remittances: MerchandiseRemittanceRecord[];
  documents: MerchandiseDocumentSummary[];
  issuedDocuments: MerchandiseRequestDocumentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface MerchandisePeriodRecord {
  id: string;
  version: number;
  label: string;
  agency: string;
  destination: MerchandiseDestination;
  status: "VIGENTE" | "ANULADO";
  startsAt: string;
  endsAt: string;
  requests: MerchandiseRequestRecord[];
  beneficiarySheets: Array<{ id: string; version: number; createdAt: string; beneficiaryCount: number }>;
  renditions: RenditionRecord[];
  createdAt: string;
  updatedAt: string;
}
