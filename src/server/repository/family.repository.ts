import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CreateFamilyInput, FindFamiliesOptions, UpdateFamilyInput } from "@/types/family";

const familyInclude = {
  members: {
    include: {
      person: true,
      missingDocuments: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

export const familyRepository = {
  async findAll(options: FindFamiliesOptions) {
    const filters: Prisma.FamilyWhereInput[] = [];

    if (options.search) {
      filters.push({
        OR: [
          { name: { contains: options.search, mode: "insensitive" as const } },
          { neighborhood: { contains: options.search, mode: "insensitive" as const } },
          { address: { contains: options.search, mode: "insensitive" as const } },
          { contactPhone: { contains: options.search } },
          { contactEmail: { contains: options.search, mode: "insensitive" as const } },
          {
            members: {
              some: {
                person: {
                  OR: [
                    { firstName: { contains: options.search, mode: "insensitive" as const } },
                    { lastName: { contains: options.search, mode: "insensitive" as const } },
                    { dni: { contains: options.search } },
                  ],
                },
              },
            },
          },
        ],
      });
    }

    if (options.neighborhood) {
      filters.push({ neighborhood: options.neighborhood });
    }

    if (options.alertsOnly) {
      filters.push({ members: { some: { missingDocuments: { some: {} } } } });
    }

    return prisma.family.findMany({
      where: { AND: filters },
      include: familyInclude,
      orderBy: [{ neighborhood: "asc" }, { name: "asc" }],
    });
  },

  async findById(id: string) {
    return prisma.family.findUnique({ where: { id }, include: familyInclude });
  },

  async findOperation(operationId: string) {
    return prisma.familyOperation.findUnique({ where: { operationId }, include: { family: { include: familyInclude } } });
  },

  async findPersonByDni(dni: string) {
    return prisma.person.findUnique({ where: { dni }, select: { id: true } });
  },

  async create(input: CreateFamilyInput, createdById: string, operationId: string, requestHash: string) {
    return prisma.$transaction(async (transaction) => {
      const people = await Promise.all(input.members.map(async (member) => ({
        input: member,
        person: await transaction.person.create({
          data: {
            firstName: member.firstName,
            lastName: member.lastName,
            dni: member.dni,
            email: member.email,
            phone: member.phone,
          },
        }),
      })));
      const referenceMember = people[input.referenceMemberIndex];

      if (!referenceMember) {
        throw new Error("El integrante referente no existe en la solicitud");
      }

      const family = await transaction.family.create({
        data: {
          name: input.name,
          neighborhood: input.neighborhood,
          address: input.address,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          referencePersonId: referenceMember.person.id,
          createdById,
          members: {
            create: people.map(({ input: member, person }) => ({
              relationship: member.relationship,
              person: { connect: { id: person.id } },
              missingDocuments: {
                create: member.missingDocuments.map((documentType) => ({ documentType })),
              },
            })),
          },
        },
        include: familyInclude,
      });

      await transaction.familyOperation.create({
        data: { operationId, actorId: createdById, familyId: family.id, requestHash },
      });

      return family;
    });
  },

  async update(id: string, input: UpdateFamilyInput) {
    return prisma.family.updateMany({
      where: { id, updatedAt: new Date(input.baseUpdatedAt) },
      data: {
        name: input.name,
        neighborhood: input.neighborhood,
        address: input.address,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
      },
    });
  },
};
