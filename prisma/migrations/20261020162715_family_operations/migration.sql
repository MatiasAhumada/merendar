-- CreateTable
CREATE TABLE "FamilyOperation" (
    "operationId" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyOperation_pkey" PRIMARY KEY ("operationId")
);

-- CreateIndex
CREATE INDEX "FamilyOperation_actorId_createdAt_idx" ON "FamilyOperation"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "FamilyOperation_familyId_idx" ON "FamilyOperation"("familyId");

-- AddForeignKey
ALTER TABLE "FamilyOperation" ADD CONSTRAINT "FamilyOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyOperation" ADD CONSTRAINT "FamilyOperation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
