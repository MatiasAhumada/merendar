/*
  Warnings:

  - Added the required column `emissionId` to the `RenditionSubmission` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RenditionSubmission" ADD COLUMN     "emissionId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "RenditionSubmission_emissionId_submittedAt_idx" ON "RenditionSubmission"("emissionId", "submittedAt");

-- AddForeignKey
ALTER TABLE "RenditionSubmission" ADD CONSTRAINT "RenditionSubmission_emissionId_fkey" FOREIGN KEY ("emissionId") REFERENCES "RenditionEmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
