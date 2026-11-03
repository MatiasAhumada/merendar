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
  findDistributionEvents,
  findModuleReceipts,
  findMerenderoSupplyReceipts,
  findFamilyMemberships,
  findMerchandisePeriod,
  findRecordPeriods,
  lockFamilyRows,
} from "@/server/repository/record.repository";
import { ApiError } from "@/utils/handlers/apiError.handler";
import { prisma } from "@/lib/prisma";
import { documentStorageProvider, storeDocumentObject } from "@/server/services/document-storage.service";

export async function createIssuedBeneficiarySheetPdf(id: string) {
  const sheet = await findBeneficiarySheet(id);

  if (!sheet) {
    throw new ApiError({ status: 404, message: DELIVERY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESA_PLANILLA });
  }

  let objectKey = sheet.storageKey;
  if (!objectKey) {
    const generatedPdf = await createBeneficiarySheetPdf(sheet.snapshot);
    const storedObject = await storeDocumentObject({ category: "beneficiary-sheet", id: sheet.id, content: generatedPdf, contentType: "application/pdf" });
    await prisma.beneficiarySheet.updateMany({
      where: { id: sheet.id, storageKey: null },
      data: { storageBucket: storedObject.bucket, storageKey: storedObject.objectKey, checksum: storedObject.checksum, byteSize: storedObject.byteSize, storageStatus: "CONFIRMED" },
    });
    const currentSheet = await prisma.beneficiarySheet.findUnique({ where: { id: sheet.id }, select: { storageKey: true } });
    objectKey = currentSheet?.storageKey ?? storedObject.objectKey;
  }
  const pdf = await documentStorageProvider.get(objectKey);
  const fileName = sheet.period.label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  return { pdf, fileName, version: sheet.version };
}

export async function getRecordWorkbench(periodId?: string, includePeriodDetails = false, includeInventory = false) {
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

  let moduleReceiptsPromise: ReturnType<typeof findModuleReceipts> | Promise<[]> = Promise.resolve([]);
  if (includeInventory) {
    moduleReceiptsPromise = findModuleReceipts();
  }

  let supplyReceiptsPromise: ReturnType<typeof findMerenderoSupplyReceipts> | Promise<[]> = Promise.resolve([]);
  if (includeInventory) {
    supplyReceiptsPromise = findMerenderoSupplyReceipts();
  }

  const [moduleReceipts, supplyReceipts, distributionEvents] = await Promise.all([
    moduleReceiptsPromise,
    supplyReceiptsPromise,
    findDistributionEvents(periodId),
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
    moduleReceipts,
    supplyReceipts,
    distributionEvents: distributionEvents.map((event) => ({ ...event, scheduledAt: event.scheduledAt.toISOString().slice(0, 10) })),
  };
}

export async function issueBeneficiarySheet(input: { periodId: string; personIds: string[]; distributionEventId?: string; userId: string }) {
  try {
    return await createSerializableTransaction(async (transaction) => {
      const period = await findMerchandisePeriod(transaction, input.periodId);

      if (!period) {
        throw new ApiError({ status: 404, message: DELIVERY_ERROR_MESSAGES.NO_ENCONTRAMOS_ESE_MODULO_O_PERIODO });
      }
      if (period.destination !== "FAMILIES") {
        throw new ApiError({ status: 400, message: DELIVERY_ERROR_MESSAGES.DESTINO_NO_COINCIDE_CON_RECEPCIONES });
      }

      const existingMemberships = await findFamilyMemberships(transaction, input.personIds);
      await lockFamilyRows(transaction, existingMemberships.map((membership) => membership.familyId));
      const memberships = await findCurrentFamilyMemberships(transaction, input.personIds);

      if (memberships.length !== input.personIds.length || memberships.some((membership) => !membership.person.dni)) {
        throw new ApiError({ status: 400, message: DELIVERY_ERROR_MESSAGES.TODOS_LOS_BENEFICIARIOS_DEBEN_PERTENECER_AL_PADRON_Y_TENER_DNI_REGISTR });
      }

      let event: { id: string; scheduledAt: Date; location: string; responsibleNames: string } | null = null;
      let eventParticipants: Array<{ familyDeliveryId: string; familyMemberId: string; paperSignatureChecked: boolean; physicalDniChecked: boolean }> = [];
      if (input.distributionEventId) {
        event = await transaction.distributionEvent.findFirst({
          where: { id: input.distributionEventId, periodId: input.periodId },
          select: { id: true, scheduledAt: true, location: true, responsibleNames: true },
        });
        if (!event) {
          throw new ApiError({ status: 404, message: DELIVERY_ERROR_MESSAGES.PLANILLA_SIN_VINCULOS_DE_RETIRO_DE_LA_JORNADA });
        }

        eventParticipants = await transaction.distributionParticipant.findMany({
          where: {
            familyDelivery: { eventId: event.id },
            familyMemberId: { in: memberships.map((membership) => membership.id) },
          },
          select: { familyDeliveryId: true, familyMemberId: true, paperSignatureChecked: true, physicalDniChecked: true },
        });
        if (eventParticipants.length !== input.personIds.length) {
          throw new ApiError({ status: 409, message: DELIVERY_ERROR_MESSAGES.PLANILLA_SIN_VINCULOS_DE_RETIRO_DE_LA_JORNADA });
        }
      } else {
        const preparedEvent = await transaction.distributionEvent.findFirst({ where: { periodId: input.periodId }, select: { id: true } });
        if (preparedEvent) {
          throw new ApiError({ status: 409, message: DELIVERY_ERROR_MESSAGES.LA_PLANILLA_DEBE_VINCULARSE_A_UNA_JORNADA_CON_RETIROS_REGISTRADOS });
        }
      }

      const version = await countBeneficiarySheets(transaction, input.periodId) + 1;
      const createdAt = new Date().toISOString();
      let snapshot: Prisma.InputJsonObject = {
        period: {
          label: period.label,
          agency: period.agency,
          startsAt: period.startsAt.toISOString().slice(0, 10),
          endsAt: period.endsAt.toISOString().slice(0, 10),
        },
        version,
        createdAt,
        templateVersion: 2,
        beneficiaries: memberships.map((membership) => {
          let participant: typeof eventParticipants[number] | undefined;
          if (event) {
            participant = eventParticipants.find((entry) => entry.familyMemberId === membership.id);
          }

          const beneficiary = {
            personId: membership.person.id,
            familyMemberId: membership.id,
            name: `${membership.person.firstName} ${membership.person.lastName}`,
            dni: membership.person.dni ?? "",
            familyName: membership.family.name,
            address: membership.family.address,
            neighborhood: membership.family.neighborhood,
          };

          if (participant) {
            return { ...beneficiary, familyDeliveryId: participant.familyDeliveryId, paperSignatureChecked: participant.paperSignatureChecked, physicalDniChecked: participant.physicalDniChecked };
          }

          return beneficiary;
        }),
      };

      if (event) {
        snapshot = { ...snapshot, event: { id: event.id, scheduledAt: event.scheduledAt.toISOString().slice(0, 10), location: event.location, responsibleNames: event.responsibleNames } };
      }

      return createBeneficiarySheet(transaction, {
        periodId: input.periodId,
        distributionEventId: event?.id,
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
