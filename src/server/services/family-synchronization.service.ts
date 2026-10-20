import { UserRole } from "@prisma/client";
import { familyPayloadSchema } from "@/validations/family.validation";
import type { SynchronizationHandler } from "@/interfaces/synchronization.interface";
import { z } from "zod";

export const familySynchronizationHandler: SynchronizationHandler = {
  allowedRoles: [UserRole.PRESIDENTE, UserRole.SECRETARIA],

  async apply(transaction, operation) {
    const baseVersionValidation = z.null().safeParse(operation.baseVersion);

    if (operation.operation !== "create" || !baseVersionValidation.success) {
      throw new Error("La sincronización familiar solo admite altas nuevas");
    }

    const parsedPayload = familyPayloadSchema.safeParse(operation.payload);

    if (!parsedPayload.success) {
      throw new Error("La operación familiar no tiene un formato válido");
    }

    const familyInput = parsedPayload.data;

    for (const member of familyInput.members) {
      if (!member.dni) {
        continue;
      }

      const existingPerson = await transaction.person.findUnique({
        where: { dni: member.dni },
        include: {
          memberships: {
            include: {
              family: { select: { id: true, name: true, neighborhood: true, address: true } },
            },
          },
        },
      });

      if (existingPerson) {
        return {
          type: "conflict",
          resourceVersion: 1,
          current: {
            kind: "duplicate_dni",
            person: {
              firstName: existingPerson.firstName,
              lastName: existingPerson.lastName,
              dni: existingPerson.dni,
              families: existingPerson.memberships.map((membership) => membership.family),
            },
          },
        };
      }
    }

    const createdPeople = await Promise.all(familyInput.members.map((member) => transaction.person.create({
      data: {
        firstName: member.firstName,
        lastName: member.lastName,
        dni: member.dni,
        email: member.email,
        phone: member.phone,
      },
    })));
    const referencePerson = createdPeople[familyInput.referenceMemberIndex];

    if (!referencePerson) {
      throw new Error("La operación familiar no indica un referente válido");
    }

    const family = await transaction.family.create({
      data: {
        id: operation.resourceId,
        name: familyInput.name,
        neighborhood: familyInput.neighborhood,
        address: familyInput.address,
        contactPhone: familyInput.contactPhone,
        contactEmail: familyInput.contactEmail,
        referencePersonId: referencePerson.id,
        createdById: operation.userId,
        members: {
          create: familyInput.members.map((member, index) => {
            const person = createdPeople[index];

            if (!person) {
              throw new Error("La operación familiar contiene una persona incompleta");
            }

            return {
              relationship: member.relationship,
              person: { connect: { id: person.id } },
              missingDocuments: {
                create: member.missingDocuments.map((documentType) => ({ documentType })),
              },
            };
          }),
        },
      },
    });

    return {
      type: "synchronized",
      resourceVersion: 1,
      result: { resourceId: family.id, name: family.name },
    };
  },
};
