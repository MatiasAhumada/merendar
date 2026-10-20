-- CreateEnum
CREATE TYPE "SyncResource" AS ENUM ('FAMILIES', 'REMITTANCES', 'RECORDS');

-- CreateTable
CREATE TABLE "SynchronizationReceipt" (
    "operationId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" "SyncResource" NOT NULL,
    "resourceId" TEXT,
    "requestHash" TEXT NOT NULL,
    "resourceVersion" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SynchronizationReceipt_pkey" PRIMARY KEY ("operationId")
);

-- CreateIndex
CREATE INDEX "SynchronizationReceipt_userId_createdAt_idx" ON "SynchronizationReceipt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SynchronizationReceipt_resource_resourceId_idx" ON "SynchronizationReceipt"("resource", "resourceId");

-- AddForeignKey
ALTER TABLE "SynchronizationReceipt" ADD CONSTRAINT "SynchronizationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
