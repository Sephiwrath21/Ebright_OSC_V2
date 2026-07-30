-- Adds resignation.exit_type — Exit stage's "Resignation" tab gets a new
-- Exit Type dropdown (Resignation/End of Contract/Internship Completed/
-- Termination/Dismissal), matching the same 4 options already used by the
-- Exit list's "Exit Type" filter (ExitListView.tsx's EXIT_TYPE_META). Values
-- are stored as the exact display label text — same convention as
-- payslip.type/nda.status/reference_letter.type/payment_info.payment_method.
-- Idempotent — safe to re-run.

ALTER TABLE resignation ADD COLUMN IF NOT EXISTS exit_type VARCHAR(30);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_resignation_exit_type'
  ) THEN
    ALTER TABLE resignation
      ADD CONSTRAINT chk_resignation_exit_type
      CHECK (exit_type IS NULL OR exit_type IN ('Resignation', 'End of Contract', 'Internship Completed', 'Termination/Dismissal'));
  END IF;
END $$;
