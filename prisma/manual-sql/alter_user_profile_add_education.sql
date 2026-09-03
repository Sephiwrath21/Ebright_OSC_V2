-- Adds user_profile.university/programme/qualification — education details
-- for an employee's profile. All three nullable, no existing rows affected.
-- Idempotent — safe to re-run.

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS university VARCHAR(255);
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS programme VARCHAR(255);
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS qualification VARCHAR(255);
