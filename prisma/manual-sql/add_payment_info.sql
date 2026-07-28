-- New table: payment_info — Employee Record's Personal Info > "Payment &
-- Bank Info" tab's "Payment" subsection (Payment Method/Payment Frequency/
-- Pay Date/Remarks). Singleton — one row per user_id (resume/medical_check/
-- probation-style 1:1 relation). Deliberately separate from bank_details,
-- which already backs the same page's "Bank Details" subsection (Bank Name/
-- Account Holder/Account Number) — no field overlap between the two.
-- payment_method/payment_frequency are constrained via a DB-level CHECK
-- constraint to the pre-existing PaymentInfoPanel placeholder's own
-- established option sets — same convention as nda.status/reference_letter.type.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS payment_info (
  payment_info_id    SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL UNIQUE,
  payment_method     VARCHAR(20),
  payment_frequency  VARCHAR(20),
  pay_date           DATE,
  remark             TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_info_user'
  ) THEN
    ALTER TABLE payment_info
      ADD CONSTRAINT fk_payment_info_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_info_method'
  ) THEN
    ALTER TABLE payment_info
      ADD CONSTRAINT chk_payment_info_method
      CHECK (payment_method IS NULL OR payment_method IN ('Bank Transfer', 'Cheque', 'Cash'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_info_frequency'
  ) THEN
    ALTER TABLE payment_info
      ADD CONSTRAINT chk_payment_info_frequency
      CHECK (payment_frequency IS NULL OR payment_frequency IN ('Monthly', 'Bi-weekly', 'Weekly'));
  END IF;
END $$;
