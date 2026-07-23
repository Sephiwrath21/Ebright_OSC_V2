-- Revert RunBlock.cadences (Cadence[]) back to a single-value cadence — a
-- task belongs to exactly one of Daily/Monthly/Ad hoc, never several.
-- Audited before writing this migration: 0 of 17 currently-tagged rows have
-- more than one value in `cadences`, so taking the first (only) element is
-- lossless for every existing row.

-- Add the new nullable single-value column first (so we can backfill from
-- the old one before it's dropped).
ALTER TABLE "RunBlock" ADD COLUMN "cadence" "Cadence";

-- Backfill: carry over each row's sole cadence value, if it had one.
UPDATE "RunBlock" SET "cadence" = "cadences"[1] WHERE cardinality("cadences") > 0;

-- Now safe to drop the old array column.
ALTER TABLE "RunBlock" DROP COLUMN "cadences";
