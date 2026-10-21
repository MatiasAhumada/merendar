-- CreateTable
CREATE TABLE "DistributionRecord" (
    "id" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "periodId" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "moduleType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "physicalDniChecked" BOOLEAN NOT NULL DEFAULT false,
    "documentsChecked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiarySheet" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeneficiarySheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRecord_operationId_key" ON "DistributionRecord"("operationId");

-- CreateIndex
CREATE INDEX "DistributionRecord_familyMemberId_receivedAt_idx" ON "DistributionRecord"("familyMemberId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRecord_periodId_familyMemberId_key" ON "DistributionRecord"("periodId", "familyMemberId");

-- CreateIndex
CREATE INDEX "BeneficiarySheet_periodId_createdAt_idx" ON "BeneficiarySheet"("periodId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiarySheet_periodId_version_key" ON "BeneficiarySheet"("periodId", "version");

-- AddForeignKey
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MerchandisePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionRecord" ADD CONSTRAINT "DistributionRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiarySheet" ADD CONSTRAINT "BeneficiarySheet_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MerchandisePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiarySheet" ADD CONSTRAINT "BeneficiarySheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
