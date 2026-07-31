-- Adds transfer.end_date + transfer.reverted_at — backs the new "Temporary
-- Transfer" Type option: end_date is the date the employee's Branch/
-- Department assignment should automatically revert back to their "From"
-- location, reverted_at marks once the scheduled sweep (see
-- src/lib/transferAutomation.ts) has actually performed that revert, so it
-- never reprocesses the same row twice. NULL for every non-temporary
-- transfer type.
-- Idempotent — safe to re-run.

ALTER TABLE transfer ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
