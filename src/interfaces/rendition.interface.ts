export interface RenditionDocumentSummary {
  id: string;
  documentType: "PLANILLA_FIRMADA" | "REMITO" | "RESPALDO";
  version: number;
  supersedesId: string | null;
  originalName: string;
  byteSize: number;
  createdAt: string;
}

export interface RenditionEmissionSummary {
  id: string;
  version: number;
  createdAt: string;
}

export interface RenditionSubmissionRecord {
  id: string;
  submittedAt: string;
  recipient: string;
  externalReference: string | null;
  notes: string | null;
  emissionId: string;
  evidenceDocumentId: string | null;
  recordedBy: { id: string; name: string };
  createdAt: string;
}

export interface RenditionSubmissionOperationPayload {
  kind: "rendition_submission";
  id: string;
  renditionId: string;
  emissionId: string;
  submittedAt: string;
  recipient: string;
  externalReference?: string;
  notes?: string;
  evidenceDocument?: { id: string; originalName: string; contentBase64: string };
}

export interface RenditionEmissionOperationPayload {
  kind: "rendition_emission";
  id: string;
  renditionId: string;
  periodId: string;
  beneficiarySheetId: string;
  sourceDocumentIds: string[];
  template: RenditionEmissionTemplate;
}

export interface RenditionEmissionTemplate {
  issueDate: string;
  locality: string;
  recipient: string;
  recipientTitle: string;
  associationName: string;
  associationResolution: string;
  associationAddress: string;
  associationPhone: string;
  associationEmail: string;
  observations: string;
  signatories: Array<{ name: string; title: string }>;
}

export interface RenditionEmissionSnapshot {
  template: RenditionEmissionTemplate;
  period: { id: string; label: string; agency: string; startsAt: string; endsAt: string; destination: "FAMILIES" | "MERENDERO" };
  sheet: { id: string; version: number; beneficiaryCount: number };
  event: { scheduledAt: string; location: string; responsibleNames: string } | null;
  deliveredModules: number;
  registeredModuleQuantity: number;
  familyCount: number;
  participants: Array<{ family: string; person: string; paperSignatureChecked: boolean; physicalDniChecked: boolean; dniPresent: boolean; missingDocumentTypes: string[] }>;
  requests: Array<{ requestNumber: string; requestedQuantity: number; approvedQuantity: number; receivedQuantity: number; unit: string; productName: string; status: string; remittances: Array<{ number: string; quantity: number; receivedAt: string }>; orderReference: string | null; notes: string | null }>;
  cycles: Array<{ externalOrderReference: string | null; authorizedRecipient: string | null; authorizationValidUntil: string | null; notes: string | null }>;
  documents: Array<{ id: string; type: string; version: number; name: string; createdAt: string; current: boolean }>;
  missingItems: string[];
  reviewStatus: "PENDIENTE" | "REVISADA" | "OBSERVADA";
  reviewNotes: string | null;
  generatedAt: string;
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
  emissions: RenditionEmissionSummary[];
  submissions: RenditionSubmissionRecord[];
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
