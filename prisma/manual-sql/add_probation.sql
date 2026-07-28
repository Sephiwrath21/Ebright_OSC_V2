-- New table: probation — Probation stage's own tab (Probation Status/Start
-- Date/End Date/Confirmation Date/Extension End Date/Confirmation Letter/
-- Extension Letter). One row per user_id (resume/interview_assessment/
-- reference_check/medical_check-style 1:1 relation) — a single probation
-- record per employee in the mock, not a repeatable list.
-- Column named probation_status (not status) to avoid confusion with
-- employment.status, which is a different concept (active/inactive/etc.)
-- on a different table.
-- confirmation_letter_file_id/extension_letter_file_id follow
-- resume.resume_file_id's exact pattern: nullable varchar(128) Google Drive
-- file-ID references.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS probation (
  probation_id                 SERIAL PRIMARY KEY,
  user_id                      INTEGER NOT NULL UNIQUE,
  probation_status             VARCHAR(20),
  start_date                   DATE,
  end_date                     DATE,
  confirm_date                 DATE,
  ext_end_date                 DATE,
  confirmation_letter_file_id  VARCHAR(128),
  extension_letter_file_id     VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_probation_user'
  ) THEN
    ALTER TABLE probation
      ADD CONSTRAINT fk_probation_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
