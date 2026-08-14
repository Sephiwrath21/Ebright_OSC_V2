-- Template Group Category (2026-08-15): "Type" moved from per-task
-- (TaskTemplate.categoryId, added 20260812100000) to a SINGLE value shared
-- by every task in a Template/Package group — one Type per saved
-- template/package, not one per task inside it. TaskTemplate.categoryId is
-- left in place (per-task data isn't backfilled/migrated into this new
-- column; the "+ Task" single-task form's own Type dropdown still reads
-- it independently of Template/Package groups). No backfill here either:
-- every existing group stays categoryId NULL, i.e. "Uncategorized".
-- AlterTable
ALTER TABLE "TaskTemplateGroup" ADD COLUMN "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "TaskTemplateGroup_categoryId_idx" ON "TaskTemplateGroup"("categoryId");

-- AddForeignKey
ALTER TABLE "TaskTemplateGroup" ADD CONSTRAINT "TaskTemplateGroup_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
