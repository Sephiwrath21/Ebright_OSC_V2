-- Optional assigner-attached Guideline (SOP link and/or image) for tasks.
-- Purely additive: new table + nullable FK column on RunBlock.

-- CreateTable
CREATE TABLE "Guideline" (
    "id" TEXT NOT NULL,
    "url" TEXT,
    "imageMime" TEXT,
    "imageData" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guideline_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RunBlock" ADD COLUMN "guidelineId" TEXT;

-- AddForeignKey
ALTER TABLE "RunBlock" ADD CONSTRAINT "RunBlock_guidelineId_fkey" FOREIGN KEY ("guidelineId") REFERENCES "Guideline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
