-- CreateEnum
CREATE TYPE "MerchandiseRequestDocumentKind" AS ENUM ('MODULES', 'MERENDERO_SUPPLIES');

-- CreateTable
CREATE TABLE "MerchandiseRequestDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "MerchandiseRequestDocumentKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "content" BYTEA NOT NULL,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchandiseRequestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchandiseRequestDocument_requestId_createdAt_idx" ON "MerchandiseRequestDocument"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchandiseRequestDocument_requestId_kind_version_key" ON "MerchandiseRequestDocument"("requestId", "kind", "version");

-- AddForeignKey
ALTER TABLE "MerchandiseRequestDocument" ADD CONSTRAINT "MerchandiseRequestDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MerchandiseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchandiseRequestDocument" ADD CONSTRAINT "MerchandiseRequestDocument_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
