-- CreateTable
CREATE TABLE "MerchandiseRequestDocumentProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "presidentName" TEXT NOT NULL DEFAULT 'Lorena Alpire',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MerchandiseRequestDocumentProfile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MerchandiseRequestDocumentProfile" ADD CONSTRAINT "MerchandiseRequestDocumentProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
