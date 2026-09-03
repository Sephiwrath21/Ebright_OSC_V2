-- New table: nda — Active stage's own "NDA" tab. Singleton — one row per
-- user_id (resume/medical_check-style 1:1 relation), confirmed via the
-- mock's single-form-only rendering (no "+Add"/history list anywhere for
-- NDA, unlike Achievement/Promotion/Transfer/Training).
-- status is constrained to Active/Expired/Pending via a CHECK constraint —
-- the pre-existing NdaPanel placeholder's own established option set.
-- attachment_file_id follows resume.resume_file_id's exact pattern.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS nda (
  nda_id             SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL UNIQUE,
  sign_date          DATE,
  effective_date     DATE,
  status             VARCHAR(20),
  attachment_file_id VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_nda_user'
  ) THEN
    ALTER TABLE nda
      ADD CONSTRAINT fk_nda_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_nda_status'
  ) THEN
    ALTER TABLE nda
      ADD CONSTRAINT chk_nda_status
      CHECK (status IS NULL OR status IN ('Active', 'Expired', 'Pending'));
  END IF;
END $$;
