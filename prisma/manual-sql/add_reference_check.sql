-- New table: reference_check — Pre-stage candidate's Reference Check tab
-- (Reference Name/Company/Relationship/Position/Contact Number/Email). One
-- row per user_id (resume/interview_assessment-style 1:1 relation) — a
-- single reference-check form per candidate in the mock, not a repeatable
-- list.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS reference_check (
  reference_check_id SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL UNIQUE,
  ref_name            VARCHAR(255),
  company             VARCHAR(200),
  relationship        VARCHAR(50),
  position            VARCHAR(100),
  contact_number      VARCHAR(30),
  email               VARCHAR(255)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_reference_check_user'
  ) THEN
    ALTER TABLE reference_check
      ADD CONSTRAINT fk_reference_check_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
