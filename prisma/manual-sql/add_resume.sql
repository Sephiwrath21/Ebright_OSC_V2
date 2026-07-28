-- New table: resume — stores each employee's Resume/CV file references
-- (Google Drive file IDs, same pattern as offboarding_case's
-- resignation_letter_file_id / induction_step's evidence_file_id).
-- One row per user_id (bank_details/emergency_contact-style 1:1 relation).
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS resume (
  resume_id      SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL UNIQUE,
  resume_file_id VARCHAR(128),
  cv_file_id     VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_resume_user'
  ) THEN
    ALTER TABLE resume
      ADD CONSTRAINT fk_resume_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
