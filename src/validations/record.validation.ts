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

export const beneficiarySheetSchema = z.object({
  periodId: z.string().trim().min(1).max(80),
  personIds: z.array(z.string().trim().min(1).max(80)).min(1).max(1000),
}).strict().refine((input) => new Set(input.personIds).size === input.personIds.length, {
  message: DELIVERY_VALIDATION_MESSAGES.REPEATED_SELECTION,
  path: ["personIds"],
});

export const beneficiarySheetDraftSchema = z.object({
  kind: z.literal("beneficiary-sheet"),
  id: z.uuid(),
  periodId: z.string().trim().min(1).max(80),
  period: z.object({
    label: z.string().trim().min(1).max(120),
    agency: z.string().trim().min(1).max(120),
    startsAt: z.iso.date(),
    endsAt: z.iso.date(),
  }).strict(),
  beneficiaries: z.array(z.object({
    personId: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(160),
    dni: z.string().trim().regex(/^\d{7,8}$/),
    familyName: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(180),
    neighborhood: z.string().trim().max(120).optional(),
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
  sheets: z.array(z.object({ id: z.string(), periodId: z.string(), version: z.number().int().positive(), createdAt: z.iso.datetime() })),
});

export type DistributionRecordPayload = z.infer<typeof distributionRecordPayloadSchema>;
export type BeneficiarySheetDraft = z.infer<typeof beneficiarySheetDraftSchema>;
export type RecordsCollection = z.infer<typeof recordsCollectionSchema>;

export interface BeneficiarySheetSnapshot {
  period: { label: string; agency: string; startsAt: string; endsAt: string };
  version: number;
  createdAt: string;
  templateVersion?: 2;
  beneficiaries: Array<{ personId: string; name: string; dni: string; familyName: string; address: string; neighborhood?: string }>;
}
