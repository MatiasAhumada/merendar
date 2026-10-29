export interface BeneficiarySheetSnapshot {
  period: { label: string; agency: string; startsAt: string; endsAt: string };
  version: number;
  createdAt: string;
  templateVersion?: 2;
  beneficiaries: Array<{ personId: string; name: string; dni: string; familyName: string; address: string; neighborhood?: string }>;
}
