-- AlterTable
ALTER TABLE "MerchandiseQuota" ADD COLUMN     "authorizationValidUntil" DATE,
ADD COLUMN     "authorizedRecipient" TEXT,
ADD COLUMN     "externalOrderNumber" TEXT;
