-- AlterTable
ALTER TABLE "MerchandiseDocument" ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MerchandiseRequestDocument" ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RenditionDocument" ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RenditionEmission" ALTER COLUMN "notePdf" DROP NOT NULL,
ALTER COLUMN "summaryPdf" DROP NOT NULL,
ALTER COLUMN "packagePdf" DROP NOT NULL;
