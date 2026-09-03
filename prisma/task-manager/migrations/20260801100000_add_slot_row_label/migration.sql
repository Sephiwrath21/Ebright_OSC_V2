-- Optional Manpower grid row label ("Opening", "6:00 PM Class", ...) —
-- drives synced task titles; null rows auto-format from startTime.
ALTER TABLE "ScheduleSlot" ADD COLUMN "rowLabel" TEXT;
