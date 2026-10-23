-- AlterTable
ALTER TABLE "MerchandisePeriod" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "MerchandiseQuota" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "MerchandiseRemittance" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "MerchandiseRequest" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;
