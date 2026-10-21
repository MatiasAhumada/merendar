export interface MerchandiseDocumentSummary {
  id: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface MerchandiseRemittanceRecord {
  id: string;
  requestId: string;
  quotaId: string;
  remittanceNumber: string;
  receivedAt: string;
  receivedQuantity: number;
  responsibleName: string;
  notes: string | null;
  createdBy: { id: string; name: string };
  documents: MerchandiseDocumentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface MerchandiseQuotaRecord {
  id: string;
  requestId: string;
  approvedQuantity: number;
  approvedAt: string;
  notes: string | null;
  approvedBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface MerchandiseRequestRecord {
  id: string;
  periodId: string;
  requestNumber: string;
  requestedAt: string;
  requestedQuantity: number;
  status: "PENDIENTE" | "APROBADA" | "RECHAZADA";
  notes: string | null;
  createdBy: { id: string; name: string };
  quota: MerchandiseQuotaRecord | null;
  remittances: MerchandiseRemittanceRecord[];
  documents: MerchandiseDocumentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface MerchandisePeriodRecord {
  id: string;
  label: string;
  agency: string;
  startsAt: string;
  endsAt: string;
  requests: MerchandiseRequestRecord[];
  createdAt: string;
  updatedAt: string;
}
