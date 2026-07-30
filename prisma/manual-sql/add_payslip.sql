-- New table: payslip — Employee Record's Finance > "Payroll/ Payslip" tab's
-- "Basic Pay" + "Payslip" subsections (Basic Salary/Salary Type/Payslip
-- attachment). Singleton — one row per user_id (resume/medical_check/
-- probation-style 1:1 relation), matching the pre-existing PayrollPanel
-- placeholder's own single-form-only rendering for these fields.
-- Deliberately separate from the existing payroll table (EPF/SOCSO/EIS/Tax/
-- PCB — Onboarding's own "Payroll" tab / Finance > "Tax Info") — no field
-- overlap, these back a different subsection of a different tab.
-- type is constrained via a DB-level CHECK constraint to the placeholder's
-- own "Salary Type" option set — same convention as nda.status/
-- reference_letter.type/payment_info.payment_method/
-- performance_review.overall_rating.
-- attachment_file_id follows resume.resume_file_id's exact pattern:
-- nullable varchar(128) Google Drive file-ID reference.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS payslip (
  payslip_id         SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL UNIQUE,
  basic_pay          DECIMAL(10, 2),
  type               VARCHAR(20),
  attachment_file_id VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payslip_user'
  ) THEN
    ALTER TABLE payslip
      ADD CONSTRAINT fk_payslip_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payslip_type'
  ) THEN
    ALTER TABLE payslip
      ADD CONSTRAINT chk_payslip_type
      CHECK (type IS NULL OR type IN ('Monthly', 'Daily Rate', 'Hourly'));
  END IF;
END $$;
