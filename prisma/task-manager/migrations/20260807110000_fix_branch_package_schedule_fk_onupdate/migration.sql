-- Corrects BranchPackageSchedule_packageGroupId_fkey's ON UPDATE behavior
-- to match schema.prisma (onUpdate: NoAction) and the existing
-- TaskTemplate.group precedent (see 20260806123000_fix_task_template_group
-- _fk_onupdate) — the original migration in this series mistakenly
-- emitted ON UPDATE CASCADE.
ALTER TABLE "BranchPackageSchedule" DROP CONSTRAINT "BranchPackageSchedule_packageGroupId_fkey";
ALTER TABLE "BranchPackageSchedule" ADD CONSTRAINT "BranchPackageSchedule_packageGroupId_fkey"
    FOREIGN KEY ("packageGroupId") REFERENCES "TaskTemplateGroup"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
