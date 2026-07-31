-- Converts performance_review from one-row-per-user to repeatable (multiple
-- reviews per user, newest first) — same shape as salary_revision — so
-- Employee Record's Active Employment > Performance Review tab can show a
-- "Performance Review History" table below the form, matching Salary
-- Revision's own form-plus-history pattern. Drops the 1:1 unique constraint,
-- replaces it with a plain index (existing single row per user is
-- unaffected, just no longer bounded to exactly one).
-- Idempotent — safe to re-run.

ALTER TABLE performance_review DROP CONSTRAINT IF EXISTS performance_review_user_id_key;

CREATE INDEX IF NOT EXISTS idx_performance_review_user ON performance_review (user_id);
