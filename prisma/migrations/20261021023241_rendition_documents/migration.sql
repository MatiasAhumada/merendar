-- CreateEnum
CREATE TYPE "RenditionReviewStatus" AS ENUM ('PENDIENTE', 'REVISADA', 'OBSERVADA');

-- CreateEnum
CREATE TYPE "RenditionDocumentType" AS ENUM ('PLANILLA_FIRMADA', 'REMITO', 'RESPALDO');

-- AlterEnum
ALTER TYPE "SyncResource" ADD VALUE 'RENDITIONS';

-- CreateTable
CREATE TABLE "Rendition" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "beneficiarySheetId" TEXT NOT NULL,
    "reviewStatus" "RenditionReviewStatus" NOT NULL DEFAULT 'PENDIENTE',
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rendition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenditionDocument" (
    "id" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "renditionId" TEXT NOT NULL,
    "documentType" "RenditionDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "supersedesId" TEXT,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenditionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rendition_periodId_createdAt_idx" ON "Rendition"("periodId", "createdAt");

-- CreateIndex
CREATE INDEX "Rendition_reviewStatus_updatedAt_idx" ON "Rendition"("reviewStatus", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rendition_beneficiarySheetId_key" ON "Rendition"("beneficiarySheetId");

-- CreateIndex
CREATE INDEX "RenditionDocument_renditionId_documentType_createdAt_idx" ON "RenditionDocument"("renditionId", "documentType", "createdAt");

-- CreateIndex
CREATE INDEX "RenditionDocument_operationId_idx" ON "RenditionDocument"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "RenditionDocument_renditionId_documentType_version_key" ON "RenditionDocument"("renditionId", "documentType", "version");

-- AddForeignKey
ALTER TABLE "Rendition" ADD CONSTRAINT "Rendition_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "MerchandisePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rendition" ADD CONSTRAINT "Rendition_beneficiarySheetId_fkey" FOREIGN KEY ("beneficiarySheetId") REFERENCES "BeneficiarySheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rendition" ADD CONSTRAINT "Rendition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rendition" ADD CONSTRAINT "Rendition_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenditionDocument" ADD CONSTRAINT "RenditionDocument_renditionId_fkey" FOREIGN KEY ("renditionId") REFERENCES "Rendition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenditionDocument" ADD CONSTRAINT "RenditionDocument_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "RenditionDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenditionDocument" ADD CONSTRAINT "RenditionDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
