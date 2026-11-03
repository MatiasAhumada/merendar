-- CreateEnum
CREATE TYPE "MerchandiseDestination" AS ENUM ('FAMILIES', 'MERENDERO');

-- AlterTable
ALTER TABLE "DistributionRecord" ADD COLUMN     "familyDeliveryId" TEXT;

-- AlterTable
ALTER TABLE "MerchandisePeriod" ADD COLUMN     "destination" "MerchandiseDestination" NOT NULL DEFAULT 'FAMILIES';

-- AlterTable
ALTER TABLE "Rendition" ADD COLUMN     "distributionEventId" TEXT;

-- CreateTable
CREATE TABLE "MerchandiseRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "presentation" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "requestedQuantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandiseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandiseQuotaItem" (
    "id" TEXT NOT NULL,
    "quotaId" TEXT NOT NULL,
    "requestItemId" TEXT NOT NULL,
    "authorizedQuantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandiseQuotaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandiseReceiptItem" (
    "id" TEXT NOT NULL,
    "remittanceId" TEXT NOT NULL,
    "quotaItemId" TEXT NOT NULL,
    "receivedQuantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchandiseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandiseCycle" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "externalOrderReference" TEXT,
    "authorizedRecipient" TEXT,
    "authorizationValidUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandiseCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionEvent" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "scheduledAt" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "responsibleNames" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "moduleQuantity" INTEGER NOT NULL DEFAULT 1,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionParticipant" (
    "id" TEXT NOT NULL,
    "familyDeliveryId" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "paperSignatureChecked" BOOLEAN NOT NULL DEFAULT false,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchandiseRequestItem_requestId_productName_idx" ON "MerchandiseRequestItem"("requestId", "productName");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandiseQuotaItem_requestItemId_key" ON "MerchandiseQuotaItem"("requestItemId");

-- CreateIndex
CREATE INDEX "MerchandiseQuotaItem_quotaId_idx" ON "MerchandiseQuotaItem"("quotaId");

-- CreateIndex
CREATE INDEX "MerchandiseReceiptItem_quotaItemId_createdAt_idx" ON "MerchandiseReceiptItem"("quotaItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandiseReceiptItem_remittanceId_quotaItemId_key" ON "MerchandiseReceiptItem"("remittanceId", "quotaItemId");

-- CreateIndex
CREATE INDEX "MerchandiseCycle_periodId_createdAt_idx" ON "MerchandiseCycle"("periodId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributionEvent_periodId_scheduledAt_idx" ON "DistributionEvent"("periodId", "scheduledAt");

-- CreateIndex
CREATE INDEX "FamilyDelivery_familyId_createdAt_idx" ON "FamilyDelivery"("familyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyDelivery_eventId_familyId_key" ON "FamilyDelivery"("eventId", "familyId");

-- CreateIndex
CREATE INDEX "DistributionParticipant_familyMemberId_createdAt_idx" ON "DistributionParticipant"("familyMemberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionParticipant_familyDeliveryId_familyMemberId_key" ON "DistributionParticipant"("familyDeliveryId", "familyMemberId");

-- CreateIndex
CREATE INDEX "Rendition_distributionEventId_idx" ON "Rendition"("distributionEventId");

-- AddForeignKey
ALTER TABLE "MerchandiseRequestItem" ADD CONSTRAINT "MerchandiseRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MerchandiseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseQuotaItem" ADD CONSTRAINT "MerchandiseQuotaItem_quotaId_fkey" FOREIGN KEY ("quotaId") REFERENCES "MerchandiseQuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseQuotaItem" ADD CONSTRAINT "MerchandiseQuotaItem_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "MerchandiseRequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseReceiptItem" ADD CONSTRAINT "MerchandiseReceiptItem_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "MerchandiseRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseReceiptItem" ADD CONSTRAINT "MerchandiseReceiptItem_quotaItemId_fkey" FOREIGN KEY ("quotaItemId") REFERENCES "MerchandiseQuotaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseCycle" ADD CONSTRAINT "MerchandiseCycle_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MerchandisePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseCycle" ADD CONSTRAINT "MerchandiseCycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionEvent" ADD CONSTRAINT "DistributionEvent_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MerchandisePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionEvent" ADD CONSTRAINT "DistributionEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyDelivery" ADD CONSTRAINT "FamilyDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DistributionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyDelivery" ADD CONSTRAINT "FamilyDelivery_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyDelivery" ADD CONSTRAINT "FamilyDelivery_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionParticipant" ADD CONSTRAINT "DistributionParticipant_familyDeliveryId_fkey" FOREIGN KEY ("familyDeliveryId") REFERENCES "FamilyDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionParticipant" ADD CONSTRAINT "DistributionParticipant_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionParticipant" ADD CONSTRAINT "DistributionParticipant_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_familyDeliveryId_fkey" FOREIGN KEY ("familyDeliveryId") REFERENCES "FamilyDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rendition" ADD CONSTRAINT "Rendition_distributionEventId_fkey" FOREIGN KEY ("distributionEventId") REFERENCES "DistributionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
