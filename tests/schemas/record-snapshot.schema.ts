import { z } from "zod";

export const versionedBeneficiarySnapshotSchema = z.object({
  templateVersion: z.literal(2),
  beneficiaries: z.array(z.object({ name: z.string(), familyName: z.string(), neighborhood: z.string() })),
});
export const localBeneficiarySnapshotSchema = z.object({
  beneficiaries: z.array(z.object({ name: z.string(), dni: z.string(), address: z.string() })),
});
