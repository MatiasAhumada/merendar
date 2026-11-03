-- AlterTable
ALTER TABLE "BeneficiarySheet" ADD COLUMN     "distributionEventId" TEXT;

-- AlterTable
ALTER TABLE "DistributionParticipant" ADD COLUMN     "physicalDniChecked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "BeneficiarySheet_distributionEventId_idx" ON "BeneficiarySheet"("distributionEventId");

-- AddForeignKey
ALTER TABLE "BeneficiarySheet" ADD CONSTRAINT "BeneficiarySheet_distributionEventId_fkey" FOREIGN KEY ("distributionEventId") REFERENCES "DistributionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
