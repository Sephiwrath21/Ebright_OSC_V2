-- Per-weekday "Remove Assignee" (2026-08-29, user request): a removal used
-- to be all-or-nothing per (templateId, userId) — now it's scoped to one
-- weekday at a time, so a person on a template spanning several days can
-- be removed from just some of them. See the TaskTemplateExcludedAssignee
-- model's own doc comment in schema.prisma for the full rule.
--
-- Existing rows meant "removed from every day" under the old model — this
-- migration preserves that exact intent by expanding each one into 6 rows
-- (one per FLOW_DAYS: Tue/Wed/Thu/Fri/Sat/Sun), THEN making weekday
-- required. Nobody's effective exclusion narrows or widens as a result of
-- this migration by itself.

-- Step 1: add the column as nullable first, so the backfill below can
-- distinguish "old, all-days row" (weekday IS NULL) from anything new.
ALTER TABLE "TaskTemplateExcludedAssignee" ADD COLUMN "weekday" TEXT;

-- Step 1b: the OLD (templateId, userId) unique index would otherwise
-- reject the 6-rows-per-old-row backfill below (each new row shares its
-- templateId/userId with 5 siblings) — drop it before inserting; Step 4
-- replaces it with the new (templateId, userId, weekday) index.
DROP INDEX IF EXISTS "TaskTemplateExcludedAssignee_templateId_userId_key";

-- Step 2: expand every existing (all-days) row into one row per weekday.
-- gen_random_uuid() has been a Postgres built-in (no extension needed)
-- since PG13; cuid()-shaped ids are an app-layer-only convention, not
-- enforced by the DB, so a uuid string is just as valid a primary key here.
INSERT INTO "TaskTemplateExcludedAssignee" (id, "templateId", "userId", weekday, "createdAt")
SELECT gen_random_uuid()::text, "templateId", "userId", d, "createdAt"
FROM "TaskTemplateExcludedAssignee", unnest(ARRAY['Tue','Wed','Thu','Fri','Sat','Sun']) AS d
WHERE weekday IS NULL;

-- Step 3: the original all-days rows are now fully superseded by the 6
-- expanded rows each — remove them.
DELETE FROM "TaskTemplateExcludedAssignee" WHERE weekday IS NULL;

-- Step 4: lock in the new shape (old index already dropped in Step 1b).
ALTER TABLE "TaskTemplateExcludedAssignee" ALTER COLUMN "weekday" SET NOT NULL;
CREATE UNIQUE INDEX "TaskTemplateExcludedAssignee_templateId_userId_weekday_key"
  ON "TaskTemplateExcludedAssignee"("templateId", "userId", "weekday");
