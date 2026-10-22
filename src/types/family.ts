import type { FamilyDocumentType } from "@prisma/client";

export interface FamilyPersonInput {
  personId?: string;
  membershipId?: string;
  firstName: string;
  lastName: string;
  dni?: string;
  email?: string;
  phone?: string;
  relationship: string;
  missingDocuments: FamilyDocumentType[];
}

export interface CreateFamilyInput {
  name: string;
  neighborhood: string;
  address: string;
  contactPhone?: string;
  contactEmail?: string;
  referenceMemberIndex: number;
  members: FamilyPersonInput[];
}

export interface UpdateFamilyInput {
  name: string;
  neighborhood: string;
  address: string;
  contactPhone?: string;
  contactEmail?: string;
  baseVersion: number;
}

export interface FamilyMemberInput {
  firstName: string;
  lastName: string;
  dni?: string;
  email?: string;
  phone?: string;
  relationship: string;
  missingDocuments: FamilyDocumentType[];
}

export interface FamilyMemberChangeInput {
  action: "add-member" | "update-member";
  memberId: string;
  personId?: string;
  member: FamilyMemberInput;
  referencePersonId: string;
}

export interface FindFamiliesOptions {
  search?: string;
  neighborhood?: string;
  alertsOnly?: boolean;
}
