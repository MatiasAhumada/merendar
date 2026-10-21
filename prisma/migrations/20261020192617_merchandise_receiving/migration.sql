-- CreateEnum
CREATE TYPE "MerchandiseRequestStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "MerchandisePeriod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandisePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandiseRequest" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "requestedAt" DATE NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "status" "MerchandiseRequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandiseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandiseQuota" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approvedQuantity" INTEGER NOT NULL,
    "approvedAt" DATE NOT NULL,
    "notes" TEXT,
    "approvedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandiseQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandiseRemittance" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "quotaId" TEXT NOT NULL,
    "remittanceNumber" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "responsibleName" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchandiseRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchandiseDocument" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "requestId" TEXT,
    "remittanceId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchandiseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchandisePeriod_startsAt_endsAt_idx" ON "MerchandisePeriod"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandisePeriod_label_agency_key" ON "MerchandisePeriod"("label", "agency");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandiseRequest_requestNumber_key" ON "MerchandiseRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "MerchandiseRequest_periodId_requestedAt_idx" ON "MerchandiseRequest"("periodId", "requestedAt");

-- CreateIndex
CREATE INDEX "MerchandiseRequest_status_requestedAt_idx" ON "MerchandiseRequest"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandiseQuota_requestId_key" ON "MerchandiseQuota"("requestId");

-- CreateIndex
CREATE INDEX "MerchandiseQuota_approvedAt_idx" ON "MerchandiseQuota"("approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandiseRemittance_remittanceNumber_key" ON "MerchandiseRemittance"("remittanceNumber");

-- CreateIndex
CREATE INDEX "MerchandiseRemittance_requestId_receivedAt_idx" ON "MerchandiseRemittance"("requestId", "receivedAt");

-- CreateIndex
CREATE INDEX "MerchandiseRemittance_quotaId_receivedAt_idx" ON "MerchandiseRemittance"("quotaId", "receivedAt");

-- CreateIndex
CREATE INDEX "MerchandiseDocument_requestId_createdAt_idx" ON "MerchandiseDocument"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "MerchandiseDocument_remittanceId_createdAt_idx" ON "MerchandiseDocument"("remittanceId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchandiseRequest" ADD CONSTRAINT "MerchandiseRequest_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MerchandisePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseRequest" ADD CONSTRAINT "MerchandiseRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseQuota" ADD CONSTRAINT "MerchandiseQuota_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MerchandiseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseQuota" ADD CONSTRAINT "MerchandiseQuota_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseRemittance" ADD CONSTRAINT "MerchandiseRemittance_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MerchandiseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseRemittance" ADD CONSTRAINT "MerchandiseRemittance_quotaId_fkey" FOREIGN KEY ("quotaId") REFERENCES "MerchandiseQuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseRemittance" ADD CONSTRAINT "MerchandiseRemittance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseDocument" ADD CONSTRAINT "MerchandiseDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MerchandiseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseDocument" ADD CONSTRAINT "MerchandiseDocument_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "MerchandiseRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseDocument" ADD CONSTRAINT "MerchandiseDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
