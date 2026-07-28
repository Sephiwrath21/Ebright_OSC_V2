-- New table: interview_assessment — Pre-stage candidate's Interview Assessment
-- tab (Interview Date/Overall Rating/Recommendation/Strength/Weakness/Hiring
-- Notes). One row per user_id (bank_details/emergency_contact/resume-style
-- 1:1 relation) — this is a single evaluation form per candidate in the
-- mock, not a repeatable list. Attachment-style columns (none needed here)
-- would follow resume.resume_file_id's pattern (nullable varchar(128)
-- reference id) if this table ever needs one.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS interview_assessment (
  interview_assessment_id SERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL UNIQUE,
  int_date                DATE,
  overall_rate            INTEGER,
  recommendation          VARCHAR(20),
  strength                TEXT,
  weakness                TEXT,
  hiring_note             TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_interview_assessment_user'
  ) THEN
    ALTER TABLE interview_assessment
      ADD CONSTRAINT fk_interview_assessment_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
