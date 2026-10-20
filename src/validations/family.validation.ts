import { FamilyDocumentType } from "@prisma/client";
import { z } from "zod";

const familyPersonSchema = z.object({
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

export const createFamilyRequestSchema = z.object({
  ...familyFields,
  operationId: z.uuid(),
}).strict().superRefine(validateFamilyMembers);

export type FamilyPayload = z.infer<typeof familyPayloadSchema>;
