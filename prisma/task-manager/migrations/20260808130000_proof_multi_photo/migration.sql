-- Proof multi-photo (2026-08-08): loosens Proof's 1:1 tie to RunBlock so a
-- task can carry up to 5 completion-evidence photos instead of exactly one
-- (app-layer cap, enforced by uploadFlowTaskProof — not the DB). Pure
-- loosening: every existing row already satisfies "at most one Proof per
-- RunBlock", which trivially still holds once the uniqueness constraint is
-- removed, so no existing row is dropped, changed, or reinterpreted — this
-- migration touches zero data, only one constraint and one index. The old
-- unique index also served as the lookup index for runBlockId; replaced
-- below with a plain (non-unique) index so uploadFlowTaskProof's per-task
-- count/list queries keep an index to hit.
-- DropIndex
DROP INDEX "Proof_runBlockId_key";

-- CreateIndex
CREATE INDEX "Proof_runBlockId_idx" ON "Proof"("runBlockId");
