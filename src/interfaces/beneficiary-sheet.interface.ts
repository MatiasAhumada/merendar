export interface BeneficiarySheetSnapshot {
  period: { label: string; agency: string; startsAt: string; endsAt: string };
  event?: { id: string; scheduledAt: string; location: string; responsibleNames: string };
  version: number;
  createdAt: string;
  templateVersion?: 2;
  beneficiaries: Array<{ personId: string; familyMemberId?: string; familyDeliveryId?: string; name: string; dni: string; familyName: string; address: string; neighborhood?: string; paperSignatureChecked?: boolean; physicalDniChecked?: boolean }>;
}
