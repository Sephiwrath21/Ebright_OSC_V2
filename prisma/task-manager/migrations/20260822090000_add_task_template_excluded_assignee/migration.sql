-- Template Assignee Exclusion (2026-08-22): "Remove Assignee" (View
-- Assignees modal) no longer cancels any FlowRun/RunBlock. This table is
-- the sole persistent effect of that action now — see the
-- TaskTemplateExcludedAssignee model's own doc comment in schema.prisma.
-- CreateTable
CREATE TABLE "TaskTemplateExcludedAssignee" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTemplateExcludedAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskTemplateExcludedAssignee_templateId_userId_key" ON "TaskTemplateExcludedAssignee"("templateId", "userId");

-- CreateIndex
CREATE INDEX "TaskTemplateExcludedAssignee_templateId_idx" ON "TaskTemplateExcludedAssignee"("templateId");

-- AddForeignKey
ALTER TABLE "TaskTemplateExcludedAssignee" ADD CONSTRAINT "TaskTemplateExcludedAssignee_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "TaskTemplate"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
