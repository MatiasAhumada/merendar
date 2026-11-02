-- CreateTable
CREATE TABLE "DistributionSupplyAllocation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receiptItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionSupplyAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributionSupplyAllocation_receiptItemId_createdAt_idx" ON "DistributionSupplyAllocation"("receiptItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionSupplyAllocation_eventId_receiptItemId_key" ON "DistributionSupplyAllocation"("eventId", "receiptItemId");

-- AddForeignKey
ALTER TABLE "DistributionSupplyAllocation" ADD CONSTRAINT "DistributionSupplyAllocation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DistributionEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionSupplyAllocation" ADD CONSTRAINT "DistributionSupplyAllocation_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "MerchandiseReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionSupplyAllocation" ADD CONSTRAINT "DistributionSupplyAllocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
