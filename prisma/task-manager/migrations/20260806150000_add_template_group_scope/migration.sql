-- Package scope for Template Groups (2026-08-06): adds a scope
-- discriminator so the same TaskTemplateGroup/TaskTemplate tables can
-- power two separate pages — Template (open to assign-capable roles +
-- Branch Manager) and Package (Branch-Manager-only) — without sharing
-- data. Every existing row defaults to TEMPLATE, matching its current
-- behavior exactly (no backfill needed).
CREATE TYPE "TemplateGroupScope" AS ENUM ('TEMPLATE', 'PACKAGE');

ALTER TABLE "TaskTemplateGroup" ADD COLUMN "scope" "TemplateGroupScope" NOT NULL DEFAULT 'TEMPLATE';

CREATE INDEX "TaskTemplateGroup_scope_idx" ON "TaskTemplateGroup"("scope");
