-- AlterTable
ALTER TABLE "DistributionEvent" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "DistributionAllocation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "moduleQuantity" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributionAllocation_remittanceId_createdAt_idx" ON "DistributionAllocation"("remittanceId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributionAllocation_familyId_createdAt_idx" ON "DistributionAllocation"("familyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionAllocation_eventId_familyId_remittanceId_key" ON "DistributionAllocation"("eventId", "familyId", "remittanceId");

-- AddForeignKey
ALTER TABLE "DistributionAllocation" ADD CONSTRAINT "DistributionAllocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DistributionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionAllocation" ADD CONSTRAINT "DistributionAllocation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionAllocation" ADD CONSTRAINT "DistributionAllocation_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "MerchandiseRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionAllocation" ADD CONSTRAINT "DistributionAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
