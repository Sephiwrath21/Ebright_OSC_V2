-- New table: promotion — Active stage's own "Promotion" tab (+ Employee
-- Record's Active Employment > "Promotion" tab's "add new" form and
-- "Promotion History" list, same concept).
-- Repeatable — same convention as achievement/salary_revision (own serial
-- PK, user_id NOT unique) — an employee can have many promotions over their
-- tenure. Confirmed via the mock's own "Promotion History" RecordTable
-- (activeEmp_promotion.html + the pre-existing ActiveEmploymentPromotionPanel
-- placeholder).
-- attachment_file_id follows resume.resume_file_id's exact pattern.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS promotion (
  promotion_id        SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL,
  promotion_date       DATE,
  effective_date       DATE,
  current_position     VARCHAR(100),
  new_position         VARCHAR(100),
  reason               TEXT,
  approved_by          VARCHAR(100),
  attachment_file_id   VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_promotion_user'
  ) THEN
    ALTER TABLE promotion
      ADD CONSTRAINT fk_promotion_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_promotion_user'
  ) THEN
    CREATE INDEX idx_promotion_user ON promotion(user_id);
  END IF;
END $$;
