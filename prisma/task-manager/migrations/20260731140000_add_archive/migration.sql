-- Archive (reversible hide): FlowRun.archivedAt hides instances from every
-- active view; TaskTemplate.archivedAt removes a template from the assign
-- picker. Both cleared by Unarchive.
ALTER TABLE "FlowRun" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "TaskTemplate" ADD COLUMN "archivedAt" TIMESTAMP(3);
