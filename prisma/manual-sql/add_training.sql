-- New table: training — Active stage's own "Training" tab (+ Employee
-- Record's Active Employment > "Training" tab, same concept).
-- Repeatable — same convention as achievement/salary_revision/promotion/
-- transfer — confirmed via the mock's own RecordTable-only rendering (no
-- single-form "current" section, just a list of records).
-- status is a free-text varchar (not CHECK-constrained) — the mock has no
-- canonical option list for this field anywhere.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS training (
  training_id SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  name        VARCHAR(255),
  date        DATE,
  status      VARCHAR(30)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_training_user'
  ) THEN
    ALTER TABLE training
      ADD CONSTRAINT fk_training_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_training_user'
  ) THEN
    CREATE INDEX idx_training_user ON training(user_id);
  END IF;
END $$;
