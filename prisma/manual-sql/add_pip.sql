-- New table: pip (Performance Improvement Plan) — Disciplinary's "PIP"
-- sub-tab. Repeatable, same convention as domestic_inquiry. No attachment
-- field — not in the user's spec, matching the mock's own PipPanel config
-- (no file field among PIP's fields, unlike the other 3 disciplinary tables).
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS pip (
  pip_id            SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL,
  start_date        DATE,
  end_date          DATE,
  supervisor        VARCHAR(100),
  review_result     TEXT,
  improvement_goal  TEXT,
  remark            TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_pip_user'
  ) THEN
    ALTER TABLE pip
      ADD CONSTRAINT fk_pip_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pip_user'
  ) THEN
    CREATE INDEX idx_pip_user ON pip(user_id);
  END IF;
END $$;
