-- Adds Email/Address to the existing emergency_contact table — Onboarding's
-- Emergency Contact tab currently only persists Name/Phone/Relationship
-- (see EmergencyContactPanel); Email/Address have been UI-only placeholders
-- until now.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

ALTER TABLE emergency_contact ADD COLUMN IF NOT EXISTS email   VARCHAR(255);
ALTER TABLE emergency_contact ADD COLUMN IF NOT EXISTS address TEXT;
