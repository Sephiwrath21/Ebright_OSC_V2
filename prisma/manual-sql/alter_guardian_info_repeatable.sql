-- Fix: guardian_info was originally created as a singleton (user_id UNIQUE)
-- based on the placeholder GuardianInfoPanel's permanently-disabled "Add
-- Another" button. Direct verification against the mock
-- (pinfo_guardianInfo.html) shows that button is real and functional
-- (id="add-guardian-btn", backed by js/guardian-add.js) — Guardian Info is
-- genuinely repeatable (multiple guardians per employee), same convention
-- as achievement/salary_revision (own serial PK, user_id NOT unique,
-- indexed instead).
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guardian_info_user_id_key'
  ) THEN
    ALTER TABLE guardian_info DROP CONSTRAINT guardian_info_user_id_key;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_guardian_info_user ON guardian_info(user_id);
