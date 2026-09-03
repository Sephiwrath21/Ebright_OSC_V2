-- New table: showcause_warning_letter — Disciplinary's "Showcause/ Warning
-- Letter" sub-tab. Repeatable, same convention as domestic_inquiry.
-- emp_response matches the user's explicit "Emp_Response" naming for
-- "Employee Response".
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS showcause_warning_letter (
  showcause_warning_letter_id SERIAL PRIMARY KEY,
  user_id                     INTEGER NOT NULL,
  type                        VARCHAR(100),
  date                        DATE,
  issued_by                   VARCHAR(100),
  status                      VARCHAR(50),
  reason                      TEXT,
  emp_response                TEXT,
  attachment_file_id          VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_showcause_warning_letter_user'
  ) THEN
    ALTER TABLE showcause_warning_letter
      ADD CONSTRAINT fk_showcause_warning_letter_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_showcause_warning_letter_user'
  ) THEN
    CREATE INDEX idx_showcause_warning_letter_user ON showcause_warning_letter(user_id);
  END IF;
END $$;
