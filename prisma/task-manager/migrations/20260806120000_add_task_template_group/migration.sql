-- Template Groups (2026-08-06): grouping layer over TaskTemplate — a named
-- collection of several tasks, created/edited/deleted/applied together.
CREATE TABLE "TaskTemplateGroup" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplateGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskTemplateGroup_createdById_idx" ON "TaskTemplateGroup"("createdById");

ALTER TABLE "TaskTemplate" ADD COLUMN "templateGroupId" TEXT;
ALTER TABLE "TaskTemplate" ADD COLUMN "groupPosition" INTEGER;

CREATE INDEX "TaskTemplate_templateGroupId_idx" ON "TaskTemplate"("templateGroupId");

ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_templateGroupId_fkey"
    FOREIGN KEY ("templateGroupId") REFERENCES "TaskTemplateGroup"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
