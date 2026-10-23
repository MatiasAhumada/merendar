-- CreateEnum
CREATE TYPE "MerchandiseRecordStatus" AS ENUM ('VIGENTE', 'ANULADO');

-- AlterEnum
ALTER TYPE "MerchandiseRequestStatus" ADD VALUE 'CANCELADA';

-- AlterTable
ALTER TABLE "MerchandisePeriod" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "status" "MerchandiseRecordStatus" NOT NULL DEFAULT 'VIGENTE';

-- AlterTable
ALTER TABLE "MerchandiseRemittance" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "status" "MerchandiseRecordStatus" NOT NULL DEFAULT 'VIGENTE';
