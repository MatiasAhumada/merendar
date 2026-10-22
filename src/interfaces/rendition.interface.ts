export interface RenditionDocumentSummary {
  id: string;
  documentType: "PLANILLA_FIRMADA" | "REMITO" | "RESPALDO";
  version: number;
  supersedesId: string | null;
  originalName: string;
  byteSize: number;
  createdAt: string;
}

export interface RenditionRecord {
  id: string;
  periodId: string;
  beneficiarySheetId: string;
  reviewStatus: "PENDIENTE" | "REVISADA" | "OBSERVADA";
  reviewNotes: string | null;
  reviewedAt: string | null;
  beneficiarySheet: { id: string; version: number; createdAt: string; beneficiaryCount: number };
  documents: RenditionDocumentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface RenditionBeneficiarySheetOption {
  id: string;
  version: number;
  createdAt: string;
  beneficiaryCount: number;
  rendition: RenditionRecord | null;
}
