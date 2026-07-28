-- New table: reference_letter — Exit stage's own "Reference Letter" tab
-- (Request Date/Letter Type/Issued Date/Issued By/Remarks/Issued Letter).
-- Singleton — one row per user_id (resume/medical_check/probation-style 1:1
-- relation), confirmed via the mock's single-form-only rendering (no
-- "+Add"/history list, unlike Achievement/Promotion/Transfer/Training).
-- type is constrained to employment/reference/service via a CHECK
-- constraint — the mock's own <select> option set (Employment Confirmation/
-- Character Reference/Service-Experience Letter).
-- issued_letter_file_id follows resume.resume_file_id's exact pattern:
-- nullable varchar(128) Google Drive file-ID reference.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS reference_letter (
  reference_letter_id  SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL UNIQUE,
  request_date         DATE,
  type                 VARCHAR(20),
  issued_date          DATE,
  issued_by            VARCHAR(100),
  remark               TEXT,
  issued_letter_file_id VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_reference_letter_user'
  ) THEN
    ALTER TABLE reference_letter
      ADD CONSTRAINT fk_reference_letter_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_reference_letter_type'
  ) THEN
    ALTER TABLE reference_letter
      ADD CONSTRAINT chk_reference_letter_type
      CHECK (type IS NULL OR type IN ('employment', 'reference', 'service'));
  END IF;
END $$;
