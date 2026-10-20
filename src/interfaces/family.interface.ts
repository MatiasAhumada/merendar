import type { FamilyDocumentType } from "@prisma/client";

export interface FamilyDocumentRecord {
  id: string;
  documentType: FamilyDocumentType;
}

export interface FamilyPersonRecord {
  id: string;
  firstName: string;
  lastName: string;
  dni: string | null;
  email: string | null;
  phone: string | null;
  relationship: string;
  missingDocuments: FamilyDocumentRecord[];
}

export interface FamilyRecord {
  id: string;
  name: string;
  neighborhood: string;
  address: string;
  contactPhone: string | null;
  contactEmail: string | null;
  referencePersonId: string | null;
  members: FamilyPersonRecord[];
  createdAt: string;
  updatedAt: string;
}
