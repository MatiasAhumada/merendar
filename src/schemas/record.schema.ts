import { z } from "zod";
import { DELIVERY_VALIDATION_MESSAGES } from "@/constants/delivery.constant";

export const distributionRecordPayloadSchema = z.object({
  kind: z.literal("distribution-record"),
  id: z.string().trim().min(1).max(80),
  periodId: z.string().trim().min(1).max(80),
  familyId: z.string().trim().min(1).max(80),
  personId: z.string().trim().min(1).max(80),
  receivedAt: z.iso.date(),
  moduleType: z.string().trim().min(2, DELIVERY_VALIDATION_MESSAGES.MODULE_TYPE_REQUIRED).max(100),
  quantity: z.number().int().positive().max(1000),
  physicalDniChecked: z.boolean(),
  documentsChecked: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const familyDeliveryPayloadSchema = z.object({
  kind: z.literal("family-delivery"),
  id: z.uuid(),
  eventId: z.string().trim().min(1).max(80),
  familyId: z.string().trim().min(1).max(80),
  participants: z.array(z.object({
    familyMemberId: z.string().trim().min(1).max(80),
    paperSignatureChecked: z.boolean(),
    physicalDniChecked: z.boolean(),
  }).strict()).min(1).max(100),
}).strict().refine((payload) => new Set(payload.participants.map((participant) => participant.familyMemberId)).size === payload.participants.length, {
  message: DELIVERY_VALIDATION_MESSAGES.REPEATED_SELECTION,
  path: ["participants"],
});

export const distributionPreparationPayloadSchema = z.object({
  kind: z.literal("distribution-preparation"),
  id: z.uuid(),
  periodId: z.string().trim().min(1).max(80),
  scheduledAt: z.iso.date(),
  location: z.string().trim().min(2).max(180),
  responsibleNames: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(1000).optional(),
  allocations: z.array(z.object({
    familyId: z.string().trim().min(1).max(80),
    remittanceId: z.string().trim().min(1).max(80),
    moduleQuantity: z.number().int().positive().max(1000),
    notes: z.string().trim().max(500).optional(),
  }).strict()).max(1000),
  supplyAllocations: z.array(z.object({
    receiptItemId: z.string().trim().min(1).max(80),
    quantity: z.number().positive().max(100000),
    notes: z.string().trim().max(500).optional(),
  }).strict()).max(1000).default([]),
}).strict().refine((payload) => payload.allocations.length + payload.supplyAllocations.length > 0, { message: DELIVERY_VALIDATION_MESSAGES.ASIGNACION_REQUERIDA, path: ["allocations"] }).refine((payload) => {
  const keys = payload.allocations.map((allocation) => `${allocation.familyId}:${allocation.remittanceId}`);
  return new Set(keys).size === keys.length;
}, { message: DELIVERY_VALIDATION_MESSAGES.REPEATED_SELECTION, path: ["allocations"] }).refine((payload) => {
  const keys = payload.supplyAllocations.map((allocation) => allocation.receiptItemId);
  return new Set(keys).size === keys.length;
}, { message: DELIVERY_VALIDATION_MESSAGES.REPEATED_SELECTION, path: ["supplyAllocations"] });

export const beneficiarySheetSchema = z.object({
  periodId: z.string().trim().min(1).max(80),
  distributionEventId: z.string().trim().min(1).max(80).optional(),
  personIds: z.array(z.string().trim().min(1).max(80)).min(1).max(1000),
}).strict().refine((input) => new Set(input.personIds).size === input.personIds.length, {
  message: DELIVERY_VALIDATION_MESSAGES.REPEATED_SELECTION,
  path: ["personIds"],
});

export const beneficiarySheetDraftSchema = z.object({
  kind: z.literal("beneficiary-sheet"),
  id: z.uuid(),
  periodId: z.string().trim().min(1).max(80),
  distributionEventId: z.string().trim().min(1).max(80).optional(),
  event: z.object({ scheduledAt: z.iso.date(), location: z.string().trim().min(2).max(180), responsibleNames: z.string().trim().min(2).max(300) }).strict().optional(),
  period: z.object({
    label: z.string().trim().min(1).max(120),
    agency: z.string().trim().min(1).max(120),
    startsAt: z.iso.date(),
    endsAt: z.iso.date(),
  }).strict(),
  beneficiaries: z.array(z.object({
    personId: z.string().trim().min(1).max(80),
    familyMemberId: z.string().trim().min(1).max(80).optional(),
    familyDeliveryId: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(160),
    dni: z.string().trim().regex(/^\d{7,8}$/),
    familyName: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(180),
    neighborhood: z.string().trim().max(120).optional(),
    paperSignatureChecked: z.boolean().optional(),
    physicalDniChecked: z.boolean().optional(),
  }).strict()).min(1).max(1000),
  templateVersion: z.literal(2).optional(),
}).strict().refine((draft) => new Set(draft.beneficiaries.map((beneficiary) => beneficiary.personId)).size === draft.beneficiaries.length, {
  message: DELIVERY_VALIDATION_MESSAGES.REPEATED_BENEFICIARIES,
  path: ["beneficiaries"],
});

export const recordsCollectionSchema = z.object({
  periods: z.array(z.object({
    id: z.string().min(1),
    label: z.string(),
    agency: z.string(),
    destination: z.enum(["FAMILIES", "MERENDERO"]).default("FAMILIES"),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  })),
  families: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    neighborhood: z.string(),
    address: z.string(),
    members: z.array(z.object({
      id: z.string().min(1),
      relationship: z.string(),
      person: z.object({ id: z.string().min(1), firstName: z.string(), lastName: z.string(), dni: z.string().nullable() }),
    })),
  })),
  records: z.array(z.object({
    id: z.string(),
    periodId: z.string(),
    personId: z.string(),
    receivedAt: z.iso.datetime(),
    moduleType: z.string(),
    quantity: z.number(),
    person: z.object({ firstName: z.string(), lastName: z.string(), dni: z.string().nullable() }),
    family: z.object({ id: z.string(), name: z.string() }),
  })),
  sheets: z.array(z.object({ id: z.string(), periodId: z.string(), distributionEventId: z.string().nullable().optional(), version: z.number().int().positive(), createdAt: z.iso.datetime() })),
  moduleReceipts: z.array(z.object({
    id: z.string(), periodId: z.string(), periodLabel: z.string(), requestNumber: z.string(), remittanceNumber: z.string(), receivedAt: z.iso.datetime(),
    receivedQuantity: z.number(), assignedQuantity: z.number(), remainingQuantity: z.number(),
  })).default([]),
  supplyReceipts: z.array(z.object({
    id: z.string(), periodId: z.string(), periodLabel: z.string(), requestNumber: z.string(), remittanceNumber: z.string(), receivedAt: z.iso.datetime(),
    productName: z.string(), presentation: z.string(), unit: z.string(), receivedQuantity: z.number(), assignedQuantity: z.number(), remainingQuantity: z.number(),
  })).default([]),
  distributionEvents: z.array(z.object({
    id: z.string(), version: z.number().int().positive(), periodId: z.string(), scheduledAt: z.iso.date(), location: z.string(),
    responsibleNames: z.string(), notes: z.string().nullable(), familyDeliveries: z.array(z.object({
      id: z.string(), familyId: z.string(), moduleQuantity: z.number().int().positive(), familyName: z.string(),
      participants: z.array(z.object({ id: z.string(), familyMemberId: z.string(), personId: z.string(), name: z.string(), dni: z.string().nullable(), paperSignatureChecked: z.boolean(), physicalDniChecked: z.boolean() })),
    })).default([]), allocations: z.array(z.object({
      id: z.string(), familyId: z.string(), familyName: z.string(), remittanceId: z.string(), remittanceNumber: z.string(), moduleQuantity: z.number().int().positive(), notes: z.string().nullable(),
    })), supplyAllocations: z.array(z.object({ id: z.string(), receiptItemId: z.string(), productName: z.string(), presentation: z.string(), unit: z.string(), remittanceNumber: z.string(), quantity: z.number(), notes: z.string().nullable() })).default([]),
  })).default([]),
});

export const beneficiarySheetResponseSchema = z.object({
  sheet: z.object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  }),
});

export const beneficiarySheetSnapshotSchema = z.object({
  period: z.object({ label: z.string(), agency: z.string(), startsAt: z.string(), endsAt: z.string() }),
  event: z.object({ id: z.string(), scheduledAt: z.string(), location: z.string(), responsibleNames: z.string() }).optional(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  templateVersion: z.literal(2).optional(),
  beneficiaries: z.array(z.object({
    personId: z.string(),
    familyMemberId: z.string().optional(),
    familyDeliveryId: z.string().optional(),
    name: z.string(),
    dni: z.string(),
    familyName: z.string(),
    address: z.string(),
    neighborhood: z.string().optional(),
    paperSignatureChecked: z.boolean().optional(),
    physicalDniChecked: z.boolean().optional(),
  })),
});

