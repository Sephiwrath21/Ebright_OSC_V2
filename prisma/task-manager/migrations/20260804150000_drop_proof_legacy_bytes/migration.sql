-- The 7 pre-Drive-cutover legacy rows (in-DB bytes, all test data) were
-- deleted before this migration ran, confirmed with the user first. Every
-- remaining/future Proof row goes through Drive (driveFileId) — these
-- columns have no readers left.
ALTER TABLE "Proof" DROP COLUMN "imageMime";
ALTER TABLE "Proof" DROP COLUMN "imageData";
