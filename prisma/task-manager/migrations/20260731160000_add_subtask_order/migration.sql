-- Explicit subtask sequence (checklist-builder order). Null = fall back
-- to creation order (pre-column rows and parents).
ALTER TABLE "RunBlock" ADD COLUMN "subtaskOrder" INTEGER;
