-- Corrects TaskTemplate_templateGroupId_fkey's ON UPDATE behavior to match
-- schema.prisma (onUpdate: NoAction) and the existing RunBlock.parent
-- precedent — the original migration in this same commit series
-- mistakenly emitted ON UPDATE CASCADE.
ALTER TABLE "TaskTemplate" DROP CONSTRAINT "TaskTemplate_templateGroupId_fkey";
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_templateGroupId_fkey"
    FOREIGN KEY ("templateGroupId") REFERENCES "TaskTemplateGroup"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
