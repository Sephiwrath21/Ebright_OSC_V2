-- Save/Assign split (2026-08-11): BranchPackageSchedule.assignedAt tracks
-- whether a config row has already been processed into a real recurring
-- task assignment. Backfilling every EXISTING row to its own createdAt is
-- required, not optional: every row that exists today went through the
-- OLD combined setBranchPackageScheduleCell, which already called the real
-- assignment engine at write time — leaving assignedAt null for those rows
-- would make the new "Assign" button re-run assignment for tasks that are
-- already live, creating a duplicate (the same class of bug this split is
-- meant to make structurally harder to hit, not easier).
-- AlterTable
ALTER TABLE "BranchPackageSchedule" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- Backfill: every pre-existing row was already really-assigned.
UPDATE "BranchPackageSchedule" SET "assignedAt" = "createdAt";
