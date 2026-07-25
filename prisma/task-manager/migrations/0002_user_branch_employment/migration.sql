-- Analytics dimensions (ANALYTICS_BRIEF.md): users belong to a branch (location)
-- and carry an employment-type display label, alongside the existing department.
ALTER TABLE "User" ADD COLUMN "branch" TEXT;
ALTER TABLE "User" ADD COLUMN "employmentType" TEXT;
