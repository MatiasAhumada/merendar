import { FamilyDocumentType } from "@prisma/client";
import { z } from "zod";

const familyPersonSchema = z.object({
  personId: z.uuid().optional(),
  membershipId: z.uuid().optional(),
  firstName: z.string().trim().min(1, "Ingresá el nombre").max(80),
  lastName: z.string().trim().min(1, "Ingresá el apellido").max(80),
  dni: z.string().trim().regex(/^\d{7,8}$/, "Ingresá un DNI de 7 u 8 números").optional(),
  email: z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional(),
  phone: z.string().trim().max(40).transform((phone) => phone || undefined).optional(),
  relationship: z.string().trim().min(1).max(40),
  missingDocuments: z.array(z.enum(FamilyDocumentType)).max(5),
}).strict();

const familyFields = {
  name: z.string().trim().min(2, "Ingresá el nombre del grupo familiar").max(120),
  neighborhood: z.string().trim().min(2, "Seleccioná un barrio").max(100),
  address: z.string().trim().min(2, "Ingresá el domicilio").max(180),
  contactPhone: z.string().trim().max(40).transform((phone) => phone || undefined).optional(),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional(),
  referenceMemberIndex: z.number().int().min(0),
  members: z.array(familyPersonSchema).min(1, "Agregá al menos una persona").max(20),
};

function validateFamilyMembers(
  family: { referenceMemberIndex: number; members: Array<{ dni?: string }> },
  context: z.RefinementCtx,
) {
  if (family.referenceMemberIndex >= family.members.length) {
    context.addIssue({
      code: "custom",
      message: "Elegí una persona referente del grupo",
      path: ["referenceMemberIndex"],
    });
  }

  const seenDnis = new Set<string>();

  family.members.forEach((member, index) => {
    if (member.dni && seenDnis.has(member.dni)) {
      context.addIssue({
        code: "custom",
        message: "El DNI está repetido en el grupo familiar",
        path: ["members", index, "dni"],
      });
    }

    if (member.dni) {
      seenDnis.add(member.dni);
    }
  });
}

export const familyPayloadSchema = z.object(familyFields).strict().superRefine(validateFamilyMembers);

export const familyMemberInputSchema = z.object({
  firstName: z.string().trim().min(1, "Ingresá el nombre").max(80),
  lastName: z.string().trim().min(1, "Ingresá el apellido").max(80),
  dni: z.string().trim().regex(/^\d{7,8}$/, "Ingresá un DNI de 7 u 8 números").optional(),
  email: z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional(),
  phone: z.string().trim().max(40).transform((phone) => phone || undefined).optional(),
  relationship: z.string().trim().min(1).max(40),
  missingDocuments: z.array(z.enum(FamilyDocumentType)).max(5),
}).strict();

export const addFamilyMemberRequestSchema = z.object({
  operationId: z.uuid(),
  baseVersion: z.number().int().nonnegative(),
  memberId: z.uuid(),
  personId: z.uuid(),
  member: familyMemberInputSchema,
  referencePersonId: z.string().min(1),
}).strict();

export const updateFamilyMemberRequestSchema = z.object({
  operationId: z.uuid(),
  baseVersion: z.number().int().nonnegative(),
  member: familyMemberInputSchema,
  referencePersonId: z.string().min(1),
}).strict();

export const familyMemberChangeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-member"),
    memberId: z.uuid(),
    personId: z.uuid(),
    member: familyMemberInputSchema,
    referencePersonId: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal("update-member"),
    memberId: z.string().min(1),
    member: familyMemberInputSchema,
    referencePersonId: z.string().min(1),
  }).strict(),
]);

export const familyPersonRecordSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dni: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  relationship: z.string(),
  missingDocuments: z.array(z.object({ id: z.string(), documentType: z.enum(FamilyDocumentType) })),
  membershipId: z.string(),
});

export const familyRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  neighborhood: z.string(),
  address: z.string(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  referencePersonId: z.string().nullable(),
  members: z.array(familyPersonRecordSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  version: z.number().int().nonnegative(),
});

export const familyCollectionSchema = z.object({ families: z.array(familyRecordSchema) });
export const familyResponseSchema = z.object({ family: familyRecordSchema });

export const createFamilyRequestSchema = z.object({
  ...familyFields,
  operationId: z.uuid(),
}).strict().superRefine(validateFamilyMembers);

export type FamilyPayload = z.infer<typeof familyPayloadSchema>;
