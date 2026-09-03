-- New table: documents — Onboarding's Documents tab (Employment Contract/
-- Employee Handbook Acknowledge uploads). One row per user_id (resume/
-- medical_check/probation-style 1:1 relation) — a single documents form per
-- employee in the mock, not a repeatable list.
-- employment_contract_file_id/employee_handbook_file_id follow
-- resume.resume_file_id's exact pattern: nullable varchar(128) Google Drive
-- file-ID references, each routed to its own dedicated Drive folder
-- (GOOGLE_DRIVE_EMP_CONTRACT_FOLDER_ID / GOOGLE_DRIVE_HANDBOOK_FOLDER_ID).
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS documents (
  documents_id                 SERIAL PRIMARY KEY,
  user_id                      INTEGER NOT NULL UNIQUE,
  employment_contract_file_id  VARCHAR(128),
  employee_handbook_file_id    VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_user'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT fk_documents_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
