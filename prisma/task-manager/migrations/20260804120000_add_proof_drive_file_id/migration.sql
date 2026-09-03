-- Proof images move to Google Drive (2026-08-04 storage decision, high
-- upload volume) — driveFileId is the reference for every new upload.
-- imageMime/imageData become nullable: retired, read-only fallback for the
-- handful of pre-existing in-DB-bytes rows, never written to again.
ALTER TABLE "Proof" ADD COLUMN "driveFileId" TEXT;
ALTER TABLE "Proof" ALTER COLUMN "imageMime" DROP NOT NULL;
ALTER TABLE "Proof" ALTER COLUMN "imageData" DROP NOT NULL;
