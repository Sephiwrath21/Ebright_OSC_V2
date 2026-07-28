-- New table: resignation — Exit stage's own "Resignation" tab (Submission
-- Date/Last Working Date/Reason/Resignation Letter/Acceptance Letter).
-- Singleton — one row per user_id (resume/medical_check/probation-style 1:1
-- relation), confirmed via the mock's single-form-only rendering (no
-- "+Add"/history list, unlike Achievement/Promotion/Transfer/Training).
-- resign_letter_file_id/accept_letter_file_id follow resume.resume_file_id's
-- exact pattern: nullable varchar(128) Google Drive file-ID references.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS resignation (
  resignation_id      SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL UNIQUE,
  submission_date      DATE,
  last_working_date    DATE,
  reason               TEXT,
  resign_letter_file_id VARCHAR(128),
  accept_letter_file_id VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_resignation_user'
  ) THEN
    ALTER TABLE resignation
      ADD CONSTRAINT fk_resignation_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
