-- CreateEnum
CREATE TYPE "DistributionEventStatus" AS ENUM ('ABIERTA', 'CERRADA');

-- AlterTable
ALTER TABLE "DistributionEvent" ADD COLUMN     "status" "DistributionEventStatus" NOT NULL DEFAULT 'ABIERTA';
