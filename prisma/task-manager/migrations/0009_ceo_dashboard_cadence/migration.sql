-- Daily and Monthly Kanban boards were incorrectly sharing one department
-- list per CEO. Scope CeoDashboardConfig by cadence so each board has its
-- own independent list/order. Per explicit decision: existing rows are
-- reset (not split/duplicated) — the CEO's next page load re-populates both
-- cadences fresh via the existing "default to all 6 departments" logic.
DELETE FROM "CeoDashboardConfig";

DROP INDEX "CeoDashboardConfig_userId_key";
ALTER TABLE "CeoDashboardConfig" ADD COLUMN "cadence" TEXT NOT NULL;

CREATE UNIQUE INDEX "CeoDashboardConfig_userId_cadence_key" ON "CeoDashboardConfig"("userId", "cadence");
