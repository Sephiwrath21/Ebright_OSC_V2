-- New table: transfer — Active stage's own "Transfer" tab (+ Employee
-- Record's Active Employment > "Transfer" tab's "add new" form and
-- "Transfer History" list, same concept).
-- Repeatable — same convention as achievement/salary_revision/promotion.
-- from_location/to_location store text (branch/department/role), not dates
-- — explicit decision, since the raw mock's type="date" inputs for these
-- would be redundant with effective_date and don't match the more common
-- real-world meaning of a transfer's From/To.
-- "type" is quoted below since it's not a reserved word but IS used loosely
-- elsewhere — no conflict, kept simple to match the user's field name
-- directly. attachment_file_id follows resume.resume_file_id's exact pattern.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS transfer (
  transfer_id         SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  type                VARCHAR(50),
  effective_date      DATE,
  from_location       VARCHAR(100),
  to_location         VARCHAR(100),
  reason              TEXT,
  attachment_file_id  VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_transfer_user'
  ) THEN
    ALTER TABLE transfer
      ADD CONSTRAINT fk_transfer_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_transfer_user'
  ) THEN
    CREATE INDEX idx_transfer_user ON transfer(user_id);
  END IF;
END $$;
