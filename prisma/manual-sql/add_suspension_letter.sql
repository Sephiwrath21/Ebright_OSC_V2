-- New table: suspension_letter — Disciplinary's "Suspension Letter" sub-tab.
-- Repeatable, same convention as domestic_inquiry.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS suspension_letter (
  suspension_letter_id SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL,
  start_date           DATE,
  end_date             DATE,
  type                 VARCHAR(100),
  reason               TEXT,
  issued_by            VARCHAR(100),
  attachment_file_id   VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_suspension_letter_user'
  ) THEN
    ALTER TABLE suspension_letter
      ADD CONSTRAINT fk_suspension_letter_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_suspension_letter_user'
  ) THEN
    CREATE INDEX idx_suspension_letter_user ON suspension_letter(user_id);
  END IF;
END $$;
