import { FAMILY_DNI_PATTERN, FAMILY_DOCUMENT_TYPES, FAMILY_LIMITS, FAMILY_VALIDATION_MESSAGES } from "@/constants/family.constant";
import { z } from "zod";

const familyPersonSchema = z.object({
  personId: z.uuid().optional(),
  membershipId: z.uuid().optional(),
  firstName: z.string().trim().min(1, FAMILY_VALIDATION_MESSAGES.FIRST_NAME_REQUIRED).max(FAMILY_LIMITS.FIRST_NAME_MAX_LENGTH),
  lastName: z.string().trim().min(1, FAMILY_VALIDATION_MESSAGES.LAST_NAME_REQUIRED).max(FAMILY_LIMITS.LAST_NAME_MAX_LENGTH),
  dni: z.string().trim().regex(FAMILY_DNI_PATTERN, FAMILY_VALIDATION_MESSAGES.DNI_INVALID).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email(FAMILY_VALIDATION_MESSAGES.EMAIL_INVALID)).optional(),
  phone: z.string().trim().max(FAMILY_LIMITS.PHONE_MAX_LENGTH).transform((phone) => phone || undefined).optional(),
  relationship: z.string().trim().min(1).max(FAMILY_LIMITS.RELATIONSHIP_MAX_LENGTH),
  missingDocuments: z.array(z.enum(FAMILY_DOCUMENT_TYPES)).max(FAMILY_LIMITS.MAX_MISSING_DOCUMENTS),
}).strict();

const requiredDniSchema = z.string({ error: FAMILY_VALIDATION_MESSAGES.DNI_INVALID })
  .trim()
  .regex(FAMILY_DNI_PATTERN, FAMILY_VALIDATION_MESSAGES.DNI_INVALID);

const familyPersonAdmissionSchema = familyPersonSchema.extend({
  dni: requiredDniSchema,
});

const argentinePhoneSchema = z.string().trim().min(1, FAMILY_VALIDATION_MESSAGES.PHONE_INVALID).max(FAMILY_LIMITS.PHONE_MAX_LENGTH).refine((phone) => {
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
}, FAMILY_VALIDATION_MESSAGES.PHONE_FORMAT);

const familyPhoneField = z.string().trim().max(40).transform((phone) => phone || undefined).optional();
const familyEmailField = z.string().trim().toLowerCase().pipe(z.email(FAMILY_VALIDATION_MESSAGES.EMAIL_INVALID)).optional();
const newFamilyPhoneField = z.union([z.literal(""), argentinePhoneSchema]).optional().transform((phone) => phone || undefined);

const familyFields = {
  name: z.string().trim().min(FAMILY_LIMITS.NAME_MIN_LENGTH, FAMILY_VALIDATION_MESSAGES.NAME_REQUIRED).max(FAMILY_LIMITS.NAME_MAX_LENGTH),
  neighborhood: z.string().trim().min(FAMILY_LIMITS.NEIGHBORHOOD_MIN_LENGTH, FAMILY_VALIDATION_MESSAGES.NEIGHBORHOOD_REQUIRED).max(FAMILY_LIMITS.NEIGHBORHOOD_MAX_LENGTH),
  address: z.string().trim().min(FAMILY_LIMITS.ADDRESS_MIN_LENGTH, FAMILY_VALIDATION_MESSAGES.ADDRESS_REQUIRED).max(FAMILY_LIMITS.ADDRESS_MAX_LENGTH),
  contactPhone: familyPhoneField,
  contactEmail: familyEmailField,
  referenceMemberIndex: z.number().int().min(0),
  members: z.array(familyPersonSchema).min(FAMILY_LIMITS.MIN_MEMBERS, FAMILY_VALIDATION_MESSAGES.MEMBER_REQUIRED).max(FAMILY_LIMITS.MAX_MEMBERS),
};

function validateFamilyMembers(
  family: { referenceMemberIndex: number; members: Array<{ dni?: string }> },
  context: z.RefinementCtx,
) {
  if (family.referenceMemberIndex >= family.members.length) {
    context.addIssue({
      code: "custom",
      message: FAMILY_VALIDATION_MESSAGES.REFERENCE_MEMBER_REQUIRED,
      path: ["referenceMemberIndex"],
    });
  }

  const seenDnis = new Set<string>();

  family.members.forEach((member, index) => {
    if (member.dni && seenDnis.has(member.dni)) {
      context.addIssue({
        code: "custom",
        message: FAMILY_VALIDATION_MESSAGES.DUPLICATE_DNI,
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
  let phoneIsValid = false;
  let emailIsValid = false;

  if (family.contactPhone) {
    phoneIsValid = argentinePhoneSchema.safeParse(family.contactPhone).success;
  }

  if (family.contactEmail) {
    emailIsValid = z.email().safeParse(family.contactEmail).success;
  }

  if (!phoneIsValid && !emailIsValid) {
    context.addIssue({
      code: "custom",
      message: FAMILY_VALIDATION_MESSAGES.PHONE_OR_EMAIL_REQUIRED,
      path: ["contactPhone"],
    });
  }
}

export const newFamilyPayloadSchema = z.object({
  ...familyFields,
  contactPhone: newFamilyPhoneField,
  members: z.array(familyPersonAdmissionSchema).min(FAMILY_LIMITS.MIN_MEMBERS, FAMILY_VALIDATION_MESSAGES.MEMBER_REQUIRED).max(FAMILY_LIMITS.MAX_MEMBERS),
}).strict().superRefine((family, context) => {
  validateFamilyMembers(family, context);
  validateRequiredFamilyContact(family, context);
});

export const familyMemberInputSchema = z.object({
  firstName: z.string().trim().min(1, FAMILY_VALIDATION_MESSAGES.FIRST_NAME_REQUIRED).max(FAMILY_LIMITS.FIRST_NAME_MAX_LENGTH),
  lastName: z.string().trim().min(1, FAMILY_VALIDATION_MESSAGES.LAST_NAME_REQUIRED).max(FAMILY_LIMITS.LAST_NAME_MAX_LENGTH),
  dni: z.string().trim().regex(FAMILY_DNI_PATTERN, FAMILY_VALIDATION_MESSAGES.DNI_INVALID).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email(FAMILY_VALIDATION_MESSAGES.EMAIL_INVALID)).optional(),
  phone: z.string().trim().max(FAMILY_LIMITS.PHONE_MAX_LENGTH).transform((phone) => phone || undefined).optional(),
  relationship: z.string().trim().min(1).max(FAMILY_LIMITS.RELATIONSHIP_MAX_LENGTH),
  missingDocuments: z.array(z.enum(FAMILY_DOCUMENT_TYPES)).max(FAMILY_LIMITS.MAX_MISSING_DOCUMENTS),
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
  missingDocuments: z.array(z.object({ id: z.string(), documentType: z.enum(FAMILY_DOCUMENT_TYPES) })),
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

export const familyDeactivationTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("family") }).strict(),
  z.object({ kind: z.literal("member"), memberId: z.string().min(1).max(128) }).strict(),
]);

export const familyDeactivationRequestSchema = z.object({
  operationId: z.uuid(),
  baseVersion: z.number().int().nonnegative(),
  target: familyDeactivationTargetSchema,
}).strict();

export const createFamilyRequestSchema = z.object({
  ...familyFields,
  contactPhone: newFamilyPhoneField,
  members: z.array(familyPersonAdmissionSchema).min(FAMILY_LIMITS.MIN_MEMBERS, FAMILY_VALIDATION_MESSAGES.MEMBER_REQUIRED).max(FAMILY_LIMITS.MAX_MEMBERS),
  operationId: z.uuid(),
}).strict().superRefine((family, context) => {
  validateFamilyMembers(family, context);
  validateRequiredFamilyContact(family, context);
});

export const familySearchSchema = z.object({
  search: z.string().trim().max(FAMILY_LIMITS.SEARCH_FILTER_MAX_LENGTH).optional(),
  neighborhood: z.string().trim().max(FAMILY_LIMITS.NEIGHBORHOOD_MAX_LENGTH).optional(),
  alerts: z.enum(["true", "false"]).optional(),
});

export const updateFamilyRequestSchema = z.object({
  name: z.string().trim().min(FAMILY_LIMITS.NAME_MIN_LENGTH, FAMILY_VALIDATION_MESSAGES.NAME_REQUIRED).max(FAMILY_LIMITS.NAME_MAX_LENGTH),
  neighborhood: z.string().trim().min(FAMILY_LIMITS.NEIGHBORHOOD_MIN_LENGTH, FAMILY_VALIDATION_MESSAGES.NEIGHBORHOOD_REQUIRED).max(FAMILY_LIMITS.NEIGHBORHOOD_MAX_LENGTH),
  address: z.string().trim().min(FAMILY_LIMITS.ADDRESS_MIN_LENGTH, FAMILY_VALIDATION_MESSAGES.ADDRESS_REQUIRED).max(FAMILY_LIMITS.ADDRESS_MAX_LENGTH),
  contactPhone: z.string().trim().max(FAMILY_LIMITS.PHONE_MAX_LENGTH).transform((phone) => phone || undefined).optional(),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email(FAMILY_VALIDATION_MESSAGES.EMAIL_INVALID)).optional(),
  baseVersion: z.number().int().nonnegative(),
}).strict();

