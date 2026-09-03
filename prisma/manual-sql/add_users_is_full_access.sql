-- New column: users.is_full_access — per-account override for the Employee
-- Overview/Record department/branch scope rule. role_type "hr"/"superadmin"
-- already grant full access on their own; this column exists purely for
-- accounts that need the same full access but whose role_type can't be
-- changed to "hr" (e.g. hr@ebright.my is role_type = "department" for
-- unrelated historical reasons — ~30 other places in the codebase already
-- key off that exact role_type string, so changing it risks side effects
-- elsewhere). Defaults to false for every account; only set true for
-- specific, deliberate exceptions below.
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_full_access BOOLEAN NOT NULL DEFAULT false;

-- hr@ebright.my: real HR staff's login, role_type = "department" as-is
-- (not renamed — see column comment above). Needs full access same as an
-- "hr"/"superadmin" role_type account would get.
UPDATE users SET is_full_access = true WHERE email = 'hr@ebright.my' AND is_full_access = false;
