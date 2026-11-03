/*
  Warnings:

  - You are about to alter the column `approvedQuantity` on the `MerchandiseQuota` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,3)`.
  - You are about to alter the column `receivedQuantity` on the `MerchandiseRemittance` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,3)`.
  - You are about to alter the column `requestedQuantity` on the `MerchandiseRequest` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,3)`.

*/
-- AlterTable
ALTER TABLE "MerchandiseQuota" ALTER COLUMN "approvedQuantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "MerchandiseRemittance" ALTER COLUMN "receivedQuantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "MerchandiseRequest" ALTER COLUMN "requestedQuantity" SET DATA TYPE DECIMAL(12,3);
