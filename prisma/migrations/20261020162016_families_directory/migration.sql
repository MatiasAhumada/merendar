-- CreateEnum
CREATE TYPE "FamilyDocumentType" AS ENUM ('DNI', 'PARTIDA_NACIMIENTO', 'CERTIFICADO_ESCOLAR', 'CERTIFICADO_MEDICO', 'OTRO');

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "referencePersonId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dni" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingDocument" (
    "id" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "documentType" "FamilyDocumentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Family_neighborhood_name_idx" ON "Family"("neighborhood", "name");

-- CreateIndex
CREATE INDEX "Family_createdById_createdAt_idx" ON "Family"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_dni_key" ON "Person"("dni");

-- CreateIndex
CREATE INDEX "Person_lastName_firstName_idx" ON "Person"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "FamilyMember_personId_idx" ON "FamilyMember"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMember_familyId_personId_key" ON "FamilyMember"("familyId", "personId");

-- CreateIndex
CREATE INDEX "MissingDocument_documentType_createdAt_idx" ON "MissingDocument"("documentType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MissingDocument_familyMemberId_documentType_key" ON "MissingDocument"("familyMemberId", "documentType");

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_referencePersonId_fkey" FOREIGN KEY ("referencePersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissingDocument" ADD CONSTRAINT "MissingDocument_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
