-- Branch Package Schedule (2026-08-07): one durable config row per
-- (branch, weekday) naming which Package (a PACKAGE-scope
-- TaskTemplateGroup) that branch's manager should have running that day —
-- the source of truth the Package Table grid reads/writes. Purely
-- additive: new enum, new table, new FK to the existing TaskTemplateGroup
-- table, new indexes — no existing table is touched.
-- CreateEnum
CREATE TYPE "PackageScheduleWeekday" AS ENUM ('WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateTable
CREATE TABLE "BranchPackageSchedule" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "weekday" "PackageScheduleWeekday" NOT NULL,
    "packageGroupId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchPackageSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchPackageSchedule_branch_weekday_key" ON "BranchPackageSchedule"("branch", "weekday");

-- CreateIndex
CREATE INDEX "BranchPackageSchedule_packageGroupId_idx" ON "BranchPackageSchedule"("packageGroupId");

-- AddForeignKey
ALTER TABLE "BranchPackageSchedule" ADD CONSTRAINT "BranchPackageSchedule_packageGroupId_fkey"
    FOREIGN KEY ("packageGroupId") REFERENCES "TaskTemplateGroup"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
