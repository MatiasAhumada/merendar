-- AlterTable
ALTER TABLE "BeneficiarySheet" ADD COLUMN     "byteSize" INTEGER,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "MerchandiseDocument" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "MerchandiseRequestDocument" ADD COLUMN     "byteSize" INTEGER,
ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "RenditionDocument" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "storageBucket" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- AlterTable
ALTER TABLE "RenditionEmission" ADD COLUMN     "noteChecksum" TEXT,
ADD COLUMN     "noteStorageBucket" TEXT,
ADD COLUMN     "noteStorageKey" TEXT,
ADD COLUMN     "packageChecksum" TEXT,
ADD COLUMN     "packageStorageBucket" TEXT,
ADD COLUMN     "packageStorageKey" TEXT,
ADD COLUMN     "summaryChecksum" TEXT,
ADD COLUMN     "summaryStorageBucket" TEXT,
ADD COLUMN     "summaryStorageKey" TEXT;
