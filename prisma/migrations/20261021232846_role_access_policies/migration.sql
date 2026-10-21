-- CreateEnum
CREATE TYPE "AccessCapability" AS ENUM ('DASHBOARD_METRICS_READ', 'FAMILIES_READ', 'FAMILIES_WRITE', 'DELIVERY_READ', 'DELIVERY_WRITE', 'MERCHANDISE_READ', 'MERCHANDISE_WRITE', 'RENDITIONS_READ', 'RENDITIONS_WRITE', 'RENDITIONS_REVIEW');

-- CreateTable
CREATE TABLE "RoleCapabilityPolicy" (
    "role" "UserRole" NOT NULL,
    "capability" "AccessCapability" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleCapabilityPolicy_pkey" PRIMARY KEY ("role","capability")
);

-- CreateTable
CREATE TABLE "AccessPolicyChange" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "capability" "AccessCapability" NOT NULL,
    "previousValue" BOOLEAN NOT NULL,
    "newValue" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPolicyChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessPolicyChange_role_createdAt_idx" ON "AccessPolicyChange"("role", "createdAt");

-- CreateIndex
CREATE INDEX "AccessPolicyChange_actorId_createdAt_idx" ON "AccessPolicyChange"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccessPolicyChange" ADD CONSTRAINT "AccessPolicyChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
