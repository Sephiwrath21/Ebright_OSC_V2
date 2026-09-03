-- New table: payroll — Onboarding's Payroll tab (Statutory Information +
-- PCB). One row per user_id (resume/medical_check/probation/documents-style
-- 1:1 relation) — a single payroll form per employee in the mock, not a
-- repeatable list.
-- Bank Name/Account Holder/Account Number are DELIBERATELY not repeated
-- here — bank_details (bank_name/account_name/bank_account) already covers
-- them 1:1 by user_id; Payroll's frontend panel will read/write that
-- existing table instead of duplicating columns.
-- pcb_form is constrained to the mock's exact 3 options via a CHECK
-- constraint rather than a Postgres ENUM type, matching this project's
-- varchar-everywhere column convention. pcb_attachment_file_id is a
-- separate nullable varchar(128) Google Drive file-ID reference (same
-- pattern as resume.resume_file_id) — distinct from the pcb_form dropdown.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS payroll (
  payroll_id              SERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL UNIQUE,
  epf_number              VARCHAR(30),
  socso_number            VARCHAR(30),
  eis_number               VARCHAR(30),
  tax_number               VARCHAR(30),
  pcb_form                 VARCHAR(3),
  pcb_attachment_file_id   VARCHAR(128)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payroll_user'
  ) THEN
    ALTER TABLE payroll
      ADD CONSTRAINT fk_payroll_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payroll_pcb_form'
  ) THEN
    ALTER TABLE payroll
      ADD CONSTRAINT chk_payroll_pcb_form
      CHECK (pcb_form IS NULL OR pcb_form IN ('TP1', 'TP2', 'TP3'));
  END IF;
END $$;
