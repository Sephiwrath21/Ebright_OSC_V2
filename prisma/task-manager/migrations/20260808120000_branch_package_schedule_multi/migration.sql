-- Package Table multi-select (2026-08-08): loosens BranchPackageSchedule's
-- uniqueness so a (branch, weekday) cell can hold more than one Package —
-- a deliberate, confirmed reversal of the original one-package-per-cell
-- design. Pure loosening: every row satisfying the old stricter
-- (branch, weekday) uniqueness automatically satisfies the new, wider
-- (branch, weekday, packageGroupId) uniqueness, so no existing row can
-- violate it and no data is affected. The old unique index also served as
-- the lookup index for (branch, weekday); since it's being replaced by a
-- wider unique index that's less useful for that lookup on its own,
-- listBranchPackageSchedule's plain (branch, weekday) fetch (now
-- potentially multi-row per cell) gets its own supporting index below.
-- DropIndex
DROP INDEX "BranchPackageSchedule_branch_weekday_key";

-- CreateIndex
CREATE UNIQUE INDEX "BranchPackageSchedule_branch_weekday_packageGroupId_key" ON "BranchPackageSchedule"("branch", "weekday", "packageGroupId");

-- CreateIndex
CREATE INDEX "BranchPackageSchedule_branch_weekday_idx" ON "BranchPackageSchedule"("branch", "weekday");
