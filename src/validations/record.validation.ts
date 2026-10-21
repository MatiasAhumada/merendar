import { z } from "zod";

export const distributionRecordPayloadSchema = z.object({
  kind: z.literal("distribution-record"),
  id: z.string().trim().min(1).max(80),
  periodId: z.string().trim().min(1).max(80),
  familyId: z.string().trim().min(1).max(80),
  personId: z.string().trim().min(1).max(80),
  receivedAt: z.iso.date(),
  moduleType: z.string().trim().min(2, "Ingresá el tipo de módulo").max(100),
  quantity: z.number().int().positive().max(1000),
  physicalDniChecked: z.boolean(),
  documentsChecked: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const beneficiarySheetSchema = z.object({
  periodId: z.string().trim().min(1).max(80),
  personIds: z.array(z.string().trim().min(1).max(80)).min(1).max(1000),
}).strict().refine((input) => new Set(input.personIds).size === input.personIds.length, {
  message: "La selección contiene personas repetidas",
  path: ["personIds"],
});

export type DistributionRecordPayload = z.infer<typeof distributionRecordPayloadSchema>;

export interface BeneficiarySheetSnapshot {
  period: { label: string; agency: string; startsAt: string; endsAt: string };
  version: number;
  createdAt: string;
  beneficiaries: Array<{ personId: string; name: string; dni: string; familyName: string; address: string }>;
}
