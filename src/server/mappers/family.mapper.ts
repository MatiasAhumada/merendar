import type { FamilyRecord } from "@/interfaces/family.interface";
import type { FamilyWithMembers } from "@/server/repository/family.repository";

export function toFamilyRecord(family: FamilyWithMembers): FamilyRecord {
  return {
    id: family.id,
    name: family.name,
    neighborhood: family.neighborhood,
    address: family.address,
    contactPhone: family.contactPhone,
    contactEmail: family.contactEmail,
    referencePersonId: family.referencePersonId,
    members: family.members.map((membership) => ({
      id: membership.person.id,
      membershipId: membership.id,
      firstName: membership.person.firstName,
      lastName: membership.person.lastName,
      dni: membership.person.dni,
      email: membership.person.email,
      phone: membership.person.phone,
      relationship: membership.relationship,
      missingDocuments: membership.missingDocuments.map((document) => ({
        id: document.id,
        documentType: document.documentType,
      })),
    })),
    createdAt: family.createdAt.toISOString(),
    updatedAt: family.updatedAt.toISOString(),
    version: family.version,
  };
}
