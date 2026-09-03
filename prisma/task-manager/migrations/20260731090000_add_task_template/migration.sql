-- Reusable "+ Task" templates: structure only (title/subtasks/cadence/
-- guideline), never recipients or completion state. Owned per creator.
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtasks" JSONB NOT NULL DEFAULT '[]',
    "cadence" "Cadence",
    "guidelineUrl" TEXT,
    "guidelineMime" TEXT,
    "guidelineImage" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskTemplate_createdById_idx" ON "TaskTemplate"("createdById");
