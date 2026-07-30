-- New table: guardian_info — Employee Record's Personal Info > "Guardian
-- Info" tab (Full Name/Relationship/Gender/Email/Phone Number/Address).
-- Singleton — one row per user_id (resume/medical_check/probation-style 1:1
-- relation); the pre-existing GuardianInfoPanel placeholder's own "Add
-- Another" button is permanently disabled (never wired to anything), so
-- only one guardian is actually supported, matching a singleton table.
-- Column names/types mirror emergency_contact's own near-identical fields
-- (name/phone/relation/email/address) for consistency.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS guardian_info (
  guardian_info_id SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL UNIQUE,
  name             VARCHAR(255),
  relationship     VARCHAR(50),
  gender           VARCHAR(20),
  email            VARCHAR(255),
  phone            VARCHAR(30),
  address          TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_guardian_info_user'
  ) THEN
    ALTER TABLE guardian_info
      ADD CONSTRAINT fk_guardian_info_user
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
