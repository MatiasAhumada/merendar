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

const requiredDniSchema = z.string({ error: "Ingresá un DNI de 7 u 8 números" })
  .trim()
  .regex(/^\d{7,8}$/, "Ingresá un DNI de 7 u 8 números");

const familyPersonAdmissionSchema = familyPersonSchema.extend({
  dni: requiredDniSchema,
});

const argentinePhoneSchema = z.string().trim().min(1, "Ingresá un teléfono argentino válido").max(40).refine((phone) => {
  const digits = phone.replace(/\D/g, "");
  let nationalNumber = digits;

  if (phone.startsWith("+54") && (digits.length === 12 || digits.length === 13)) {
    nationalNumber = digits.slice(2);

    if (nationalNumber.startsWith("9")) {
      nationalNumber = nationalNumber.slice(1);
    }
  } else if (digits.length === 11 && digits.startsWith("0")) {
    nationalNumber = digits.slice(1);
  }

  return /^\d{10}$/.test(nationalNumber) && /^[1-368]/.test(nationalNumber);
}, "Ingresá característica y número de abonado (10 dígitos)");

const familyPhoneField = z.string().trim().max(40).transform((phone) => phone || undefined).optional();
const familyEmailField = z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional();
const newFamilyPhoneField = z.union([z.literal(""), argentinePhoneSchema]).optional().transform((phone) => phone || undefined);

const familyFields = {
  name: z.string().trim().min(2, "Ingresá el nombre del grupo familiar").max(120),
  neighborhood: z.string().trim().min(2, "Seleccioná un barrio").max(100),
  address: z.string().trim().min(2, "Ingresá el domicilio").max(180),
  contactPhone: familyPhoneField,
  contactEmail: familyEmailField,
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

function validateRequiredFamilyContact(
  family: { contactPhone?: string; contactEmail?: string },
  context: z.RefinementCtx,
) {
  const phoneIsValid = family.contactPhone ? argentinePhoneSchema.safeParse(family.contactPhone).success : false;
  const emailIsValid = family.contactEmail ? z.email().safeParse(family.contactEmail).success : false;

  if (!phoneIsValid && !emailIsValid) {
    context.addIssue({
      code: "custom",
      message: "Ingresá un teléfono argentino válido o un email de contacto válido",
      path: ["contactPhone"],
    });
  }
}

export const newFamilyPayloadSchema = z.object({
  ...familyFields,
  contactPhone: newFamilyPhoneField,
  members: z.array(familyPersonAdmissionSchema).min(1, "Agregá al menos una persona").max(20),
}).strict().superRefine((family, context) => {
  validateFamilyMembers(family, context);
  validateRequiredFamilyContact(family, context);
});

export const familyMemberInputSchema = z.object({
  firstName: z.string().trim().min(1, "Ingresá el nombre").max(80),
  lastName: z.string().trim().min(1, "Ingresá el apellido").max(80),
  dni: z.string().trim().regex(/^\d{7,8}$/, "Ingresá un DNI de 7 u 8 números").optional(),
  email: z.string().trim().toLowerCase().pipe(z.email("Ingresá un email válido")).optional(),
  phone: z.string().trim().max(40).transform((phone) => phone || undefined).optional(),
  relationship: z.string().trim().min(1).max(40),
  missingDocuments: z.array(z.enum(FamilyDocumentType)).max(5),
}).strict();

export const newFamilyMemberInputSchema = familyMemberInputSchema.extend({
  dni: requiredDniSchema,
});

export const addFamilyMemberRequestSchema = z.object({
  operationId: z.uuid(),
  baseVersion: z.number().int().nonnegative(),
  memberId: z.uuid(),
  personId: z.uuid(),
  member: newFamilyMemberInputSchema,
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

export const newFamilyMemberChangeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-member"),
    memberId: z.uuid(),
    personId: z.uuid(),
    member: newFamilyMemberInputSchema,
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
  contactPhone: newFamilyPhoneField,
  members: z.array(familyPersonAdmissionSchema).min(1, "Agregá al menos una persona").max(20),
  operationId: z.uuid(),
}).strict().superRefine((family, context) => {
  validateFamilyMembers(family, context);
  validateRequiredFamilyContact(family, context);
});

export type FamilyPayload = z.infer<typeof familyPayloadSchema>;
