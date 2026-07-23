-- Manpower Schedule v1: retires the v0 ManpowerShift prototype in favor of a
-- proper grid (ManpowerSchedule = one day's header, ScheduleSlot = one cell)
-- that syncs into the existing task engine (RunBlock) on publish.

DROP TABLE "ManpowerShift";

ALTER TABLE "RunBlock" ADD COLUMN "scheduleSlotId" TEXT;

CREATE TYPE "ScheduleStatus" AS ENUM ('PLANNING', 'PUBLISHED');

CREATE TABLE "ManpowerSchedule" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PLANNING',
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManpowerSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManpowerSchedule_branch_date_key" ON "ManpowerSchedule"("branch", "date");

CREATE TABLE "ScheduleSlot" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "roleColumn" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "runBlockId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleSlot_scheduleId_idx" ON "ScheduleSlot"("scheduleId");

CREATE UNIQUE INDEX "ScheduleSlot_scheduleId_startTime_endTime_roleColumn_key" ON "ScheduleSlot"("scheduleId", "startTime", "endTime", "roleColumn");

ALTER TABLE "ScheduleSlot" ADD CONSTRAINT "ScheduleSlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ManpowerSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
