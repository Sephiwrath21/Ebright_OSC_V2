-- New table: domestic_inquiry — Disciplinary's "Domestic Inquiry" sub-tab.
-- Repeatable — same convention as achievement/promotion/etc — confirmed via
-- the pre-existing DomesticInquiryPanel/DisciplinarySection placeholder's
-- own "+Add a domestic inquiry record" modal pattern.
-- Field types follow js/disciplinary-record.js's CONFIGS: single-line text
-- fields (panel, decision) as varchar, textarea fields (case_summary) as
-- text. attachment_file_id follows resume.resume_file_id's exact pattern.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS domestic_inquiry (
  domestic_inquiry_id SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  date                DATE,
  panel               VARCHAR(255),
  case_summary        TEXT,
  decision            TEXT,
  attachment_file_id  VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_domestic_inquiry_user'
  ) THEN
    ALTER TABLE domestic_inquiry
      ADD CONSTRAINT fk_domestic_inquiry_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_domestic_inquiry_user'
  ) THEN
    CREATE INDEX idx_domestic_inquiry_user ON domestic_inquiry(user_id);
  END IF;
END $$;
