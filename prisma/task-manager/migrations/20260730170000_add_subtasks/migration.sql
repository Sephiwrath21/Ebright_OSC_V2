-- Main Task ↔ Subtask link (My Tasks tree display + "+ Task" Subtasks
-- builder). A subtask is a full RunBlock in its own run; SET NULL on
-- parent delete degrades it to a normal top-level task.
ALTER TABLE "RunBlock" ADD COLUMN "parentId" TEXT;

CREATE INDEX "RunBlock_parentId_idx" ON "RunBlock"("parentId");

ALTER TABLE "RunBlock" ADD CONSTRAINT "RunBlock_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RunBlock"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
