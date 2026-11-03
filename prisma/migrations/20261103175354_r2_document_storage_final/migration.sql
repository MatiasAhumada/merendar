/*
  Warnings:

  - You are about to drop the column `content` on the `MerchandiseDocument` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `MerchandiseRequestDocument` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `RenditionDocument` table. All the data in the column will be lost.
  - You are about to drop the column `notePdf` on the `RenditionEmission` table. All the data in the column will be lost.
  - You are about to drop the column `packagePdf` on the `RenditionEmission` table. All the data in the column will be lost.
  - You are about to drop the column `summaryPdf` on the `RenditionEmission` table. All the data in the column will be lost.
  - Made the column `checksum` on table `MerchandiseDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `storageBucket` on table `MerchandiseDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `storageKey` on table `MerchandiseDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `byteSize` on table `MerchandiseRequestDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `checksum` on table `MerchandiseRequestDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `storageBucket` on table `MerchandiseRequestDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `storageKey` on table `MerchandiseRequestDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `checksum` on table `RenditionDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `storageBucket` on table `RenditionDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `storageKey` on table `RenditionDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `noteChecksum` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `noteStorageBucket` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `noteStorageKey` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `packageChecksum` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `packageStorageBucket` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `packageStorageKey` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `summaryChecksum` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `summaryStorageBucket` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.
  - Made the column `summaryStorageKey` on table `RenditionEmission` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "MerchandiseDocument" DROP COLUMN "content",
ALTER COLUMN "checksum" SET NOT NULL,
ALTER COLUMN "storageBucket" SET NOT NULL,
ALTER COLUMN "storageKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "MerchandiseRequestDocument" DROP COLUMN "content",
ALTER COLUMN "byteSize" SET NOT NULL,
ALTER COLUMN "checksum" SET NOT NULL,
ALTER COLUMN "storageBucket" SET NOT NULL,
ALTER COLUMN "storageKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "RenditionDocument" DROP COLUMN "content",
ALTER COLUMN "checksum" SET NOT NULL,
ALTER COLUMN "storageBucket" SET NOT NULL,
ALTER COLUMN "storageKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "RenditionEmission" DROP COLUMN "notePdf",
DROP COLUMN "packagePdf",
DROP COLUMN "summaryPdf",
ALTER COLUMN "noteChecksum" SET NOT NULL,
ALTER COLUMN "noteStorageBucket" SET NOT NULL,
ALTER COLUMN "noteStorageKey" SET NOT NULL,
ALTER COLUMN "packageChecksum" SET NOT NULL,
ALTER COLUMN "packageStorageBucket" SET NOT NULL,
ALTER COLUMN "packageStorageKey" SET NOT NULL,
ALTER COLUMN "summaryChecksum" SET NOT NULL,
ALTER COLUMN "summaryStorageBucket" SET NOT NULL,
ALTER COLUMN "summaryStorageKey" SET NOT NULL;
