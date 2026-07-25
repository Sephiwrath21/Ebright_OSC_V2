-- Sub-split of employmentType "Coach" for the assign-task recipient picker's
-- "By Group" filter (Full Time Coach / Part Time Coach). Does not affect the
-- Branch Status by Region analytics, which still matches employmentType "Coach".
ALTER TABLE "User" ADD COLUMN "coachSchedule" TEXT;
