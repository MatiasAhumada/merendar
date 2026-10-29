import { Prisma } from "@prisma/client";
import { DELIVERY_ERROR_MESSAGES } from "@/constants/delivery.constant";
import { familyRepository } from "@/server/repository/family.repository";
import { createBeneficiarySheetPdf } from "@/server/services/beneficiary-sheet.service";
import {
  countBeneficiarySheets,
  createBeneficiarySheet,
  createSerializableTransaction,
  findBeneficiarySheet,
  findBeneficiarySheets,
  findCurrentFamilyMemberships,
  findDistributionRecords,
  findFamilyMemberships,
  findMerchandisePeriod,
  findRecordPeriods,
  lockFamilyRows,
} from "@/server/repository/record.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";

export async function createIssuedBeneficiarySheetPdf(id: string) {
  const sheet = await findBeneficiarySheet(id);

  if (!sheet) {
    throw new ApiError({ status: 404, message: DELIVERY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_PLANILLA });
  }

  const pdf = await createBeneficiarySheetPdf(sheet.snapshot);
  const fileName = sheet.period.label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  return { pdf, fileName, version: sheet.version };
}

export async function getRecordWorkbench(periodId?: string, includePeriodDetails = false) {
  const includeDetails = Boolean(periodId || includePeriodDetails);
  let distributionRecordsPromise: ReturnType<typeof findDistributionRecords> | Promise<[]> = Promise.resolve([]);
  let beneficiarySheetsPromise: ReturnType<typeof findBeneficiarySheets> | Promise<[]> = Promise.resolve([]);

  if (includeDetails) {
    distributionRecordsPromise = findDistributionRecords(periodId || undefined);
    beneficiarySheetsPromise = findBeneficiarySheets(periodId || undefined);
  }

  const [periods, families, records, sheets] = await Promise.all([
    findRecordPeriods(),
    familyRepository.findAll({}),
    distributionRecordsPromise,
    beneficiarySheetsPromise,
  ]);

  return {
    periods,
    families,
    records: records.map(({ familyMember, ...record }) => ({
      ...record,
      personId: familyMember.person.id,
      person: familyMember.person,
      family: familyMember.family,
    })),
    sheets,
  };
}

export async function issueBeneficiarySheet(input: { periodId: string; personIds: string[]; userId: string }) {
  try {
    return await createSerializableTransaction(async (transaction) => {
      const period = await findMerchandisePeriod(transaction, input.periodId);

      if (!period) {
        throw new ApiError({ status: 404, message: DELIVERY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_MODULO_O_PERIODO });
      }

      const existingMemberships = await findFamilyMemberships(transaction, input.personIds);
      await lockFamilyRows(transaction, existingMemberships.map((membership) => membership.familyId));
      const memberships = await findCurrentFamilyMemberships(transaction, input.personIds);

      if (memberships.length !== input.personIds.length || memberships.some((membership) => !membership.person.dni)) {
        throw new ApiError({ status: 400, message: DELIVERY_ERROR_MESSAGES.TODOS_LOS_BENEFICIARIOS_DEBEN_PERTENECER_AL_PADRON_Y_TENER_DNI_REGISTR });
      }

      const version = await countBeneficiarySheets(transaction, input.periodId) + 1;
      const createdAt = new Date().toISOString();
      const snapshot: Prisma.InputJsonValue = {
        period: {
          label: period.label,
          agency: period.agency,
          startsAt: period.startsAt.toISOString().slice(0, 10),
          endsAt: period.endsAt.toISOString().slice(0, 10),
        },
        version,
        createdAt,
        templateVersion: 2,
        beneficiaries: memberships.map(({ person, family }) => ({
          personId: person.id,
          name: `${person.firstName} ${person.lastName}`,
          dni: person.dni ?? "",
          familyName: family.name,
          address: family.address,
          neighborhood: family.neighborhood,
        })),
      };

      return createBeneficiarySheet(transaction, {
        periodId: input.periodId,
        version,
        snapshot,
        createdById: input.userId,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new ApiError({ status: 409, message: DELIVERY_ERROR_MESSAGES.EL_PADRON_CAMBIO_MIENTRAS_SE_EMITIA_LA_PLANILLA_ACTUALIZA_LOS_DATOS_Y_ });
    }

    throw error;
  }
}
