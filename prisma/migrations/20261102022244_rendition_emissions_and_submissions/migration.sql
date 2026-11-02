-- CreateTable
CREATE TABLE "RenditionEmission" (
    "id" TEXT NOT NULL,
    "renditionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "notePdf" BYTEA NOT NULL,
    "summaryPdf" BYTEA NOT NULL,
    "packagePdf" BYTEA NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenditionEmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenditionSubmission" (
    "id" TEXT NOT NULL,
    "renditionId" TEXT NOT NULL,
    "submittedAt" DATE NOT NULL,
    "recipient" TEXT NOT NULL,
    "externalReference" TEXT,
    "notes" TEXT,
    "evidenceDocumentId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenditionSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenditionEmission_renditionId_createdAt_idx" ON "RenditionEmission"("renditionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RenditionEmission_renditionId_version_key" ON "RenditionEmission"("renditionId", "version");

-- CreateIndex
CREATE INDEX "RenditionSubmission_renditionId_submittedAt_idx" ON "RenditionSubmission"("renditionId", "submittedAt");

-- CreateIndex
CREATE INDEX "RenditionSubmission_recordedById_createdAt_idx" ON "RenditionSubmission"("recordedById", "createdAt");

-- AddForeignKey
ALTER TABLE "RenditionEmission" ADD CONSTRAINT "RenditionEmission_renditionId_fkey" FOREIGN KEY ("renditionId") REFERENCES "Rendition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenditionEmission" ADD CONSTRAINT "RenditionEmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenditionSubmission" ADD CONSTRAINT "RenditionSubmission_renditionId_fkey" FOREIGN KEY ("renditionId") REFERENCES "Rendition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenditionSubmission" ADD CONSTRAINT "RenditionSubmission_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenditionSubmission" ADD CONSTRAINT "RenditionSubmission_evidenceDocumentId_fkey" FOREIGN KEY ("evidenceDocumentId") REFERENCES "RenditionDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
