-- New table: medical_check — Onboarding's Medical Check tab (Medical Report
-- upload/Result). One row per user_id (resume/interview_assessment/
-- reference_check-style 1:1 relation) — a single medical-check form per
-- candidate in the mock, not a repeatable list.
-- medical_report_file_id follows resume.resume_file_id's exact pattern: a
-- nullable varchar(128) Google Drive file-ID reference, uploaded/replaced/
-- deleted the same way (uploadToDrive/deleteFromDrive) once wired to the
-- frontend.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS medical_check (
  medical_check_id       SERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL UNIQUE,
  medical_report_file_id  VARCHAR(128),
  result                  VARCHAR(30)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_medical_check_user'
  ) THEN
    ALTER TABLE medical_check
      ADD CONSTRAINT fk_medical_check_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
