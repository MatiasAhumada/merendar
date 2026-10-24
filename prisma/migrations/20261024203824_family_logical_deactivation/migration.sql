-- CreateEnum
CREATE TYPE "FamilyOperationAction" AS ENUM ('LEGACY', 'FAMILY_DEACTIVATED', 'MEMBER_DEACTIVATED');

-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT;

-- AlterTable
ALTER TABLE "FamilyMember" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT;

-- AlterTable
ALTER TABLE "FamilyOperation" ADD COLUMN     "action" "FamilyOperationAction" NOT NULL DEFAULT 'LEGACY';

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
