-- New table: performance_review — Employee Record's Active Employment >
-- "Performance Review" tab (Review Period/Review Date/Reviewer/Overall
-- Rating/Comment/Attachment). Singleton — one row per user_id (resume/
-- medical_check/probation-style 1:1 relation), confirmed via the
-- pre-existing PerformanceReviewPanel placeholder's own single-form-only
-- rendering (no "+Add"/history list, unlike Achievement/Promotion/Transfer).
-- overall_rating is constrained via a DB-level CHECK constraint to the
-- placeholder's own established option set — same convention as
-- nda.status/reference_letter.type/payment_info.payment_method.
-- attachment_file_id follows resume.resume_file_id's exact pattern:
-- nullable varchar(128) Google Drive file-ID reference.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS performance_review (
  performance_review_id SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL UNIQUE,
  period                VARCHAR(50),
  review_date           DATE,
  reviewer              VARCHAR(100),
  overall_rating        VARCHAR(30),
  comment               TEXT,
  attachment_file_id    VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_performance_review_user'
  ) THEN
    ALTER TABLE performance_review
      ADD CONSTRAINT fk_performance_review_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_performance_review_rating'
  ) THEN
    ALTER TABLE performance_review
      ADD CONSTRAINT chk_performance_review_rating
      CHECK (overall_rating IS NULL OR overall_rating IN ('Exceeds Expectations', 'Meets Expectations', 'Below Expectations'));
  END IF;
END $$;
