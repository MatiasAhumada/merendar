-- CreateEnum
CREATE TYPE "DocumentStorageProvider" AS ENUM ('CLOUDFLARE_R2');

-- CreateEnum
CREATE TYPE "DocumentStorageStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- AlterTable
ALTER TABLE "BeneficiarySheet" ADD COLUMN     "storageProvider" "DocumentStorageProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
ADD COLUMN     "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "MerchandiseDocument" ADD COLUMN     "storageProvider" "DocumentStorageProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
ADD COLUMN     "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "MerchandiseRequestDocument" ADD COLUMN     "storageProvider" "DocumentStorageProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
ADD COLUMN     "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "RenditionDocument" ADD COLUMN     "storageProvider" "DocumentStorageProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
ADD COLUMN     "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "RenditionEmission" ADD COLUMN     "storageProvider" "DocumentStorageProvider" NOT NULL DEFAULT 'CLOUDFLARE_R2',
ADD COLUMN     "storageStatus" "DocumentStorageStatus" NOT NULL DEFAULT 'CONFIRMED';
