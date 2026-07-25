-- New table: non_compete — Active stage's own "Non-Compete" tab. Singleton
-- — one row per user_id, same convention as nda (confirmed via the mock's
-- single-form-only rendering, no history list).
-- duration is free-text (e.g. "12 months", "2 years") — no structured
-- interval type used, matching the mock's plain text field.
-- attachment_file_id follows resume.resume_file_id's exact pattern.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS non_compete (
  non_compete_id     SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL UNIQUE,
  sign_date          DATE,
  expiry_date        DATE,
  duration           VARCHAR(50),
  attachment_file_id VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_non_compete_user'
  ) THEN
    ALTER TABLE non_compete
      ADD CONSTRAINT fk_non_compete_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
