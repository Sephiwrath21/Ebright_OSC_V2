-- Weekly auto-recurrence (opt-in "Repeat weekly" toggle, DAILY cadence only):
-- flag + self-referencing series link. recurrenceOfId is UNIQUE so a block
-- can have at most one successor — concurrent lazy catch-ups collapse into
-- one winner instead of duplicating next week's occurrence.
ALTER TABLE "RunBlock" ADD COLUMN "repeatWeekly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RunBlock" ADD COLUMN "recurrenceOfId" TEXT;

CREATE UNIQUE INDEX "RunBlock_recurrenceOfId_key" ON "RunBlock"("recurrenceOfId");
CREATE INDEX "RunBlock_repeatWeekly_dueAt_idx" ON "RunBlock"("repeatWeekly", "dueAt");

ALTER TABLE "RunBlock" ADD CONSTRAINT "RunBlock_recurrenceOfId_fkey"
  FOREIGN KEY ("recurrenceOfId") REFERENCES "RunBlock"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
