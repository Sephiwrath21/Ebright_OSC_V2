-- New table: salary_revision — Active stage's own "Salary Revision" tab (+
-- Employee Record's Finance > Payroll/Payslip's "Salary Revision" section,
-- same concept). Created as a separate table from the existing
-- employee_rate_history (which only tracks rate/effective_from/effective_to
-- with no reason/approval/attachment) per explicit decision — this table is
-- the richer audit-trail record, employee_rate_history is left untouched.
-- Repeatable — same convention as achievement (own serial PK, user_id NOT
-- unique) — an employee can have many salary revisions over their tenure.
-- salary_adjustment stores the % change (e.g. 12.50 for +12.5%), matching
-- the mock's own SalaryAdjustmentField display. attachment_file_id follows
-- resume.resume_file_id's exact pattern.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS salary_revision (
  salary_revision_id SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  issued_date         DATE,
  effective_date      DATE,
  current_salary      DECIMAL(10, 2),
  new_salary          DECIMAL(10, 2),
  reason              TEXT,
  salary_adjustment   DECIMAL(6, 2),
  approved_by         VARCHAR(100),
  attachment_file_id  VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_salary_revision_user'
  ) THEN
    ALTER TABLE salary_revision
      ADD CONSTRAINT fk_salary_revision_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_salary_revision_user'
  ) THEN
    CREATE INDEX idx_salary_revision_user ON salary_revision(user_id);
  END IF;
END $$;
