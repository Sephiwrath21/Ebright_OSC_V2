-- Data-only migration (no schema change — employmentType is a plain String
-- column, not a Prisma enum): splits the generic "Executive" employmentType
-- value into two distinct values, per the confirmed mutual-exclusivity rule
-- (a person with employmentType "Executive" always had EITHER department OR
-- branch set, never both/neither — verified against live data before this
-- migration was written: 16 rows, 0 ambiguous).
--
-- "HQ Exec" = department-side (BRANCH_STAFF_ROLES' department-side twin,
-- DEPARTMENT_EMPLOYMENT_TYPES in _lib.ts).
-- "Branch Exec" = branch-side (BRANCH_STAFF_ROLES in _lib.ts) — the value
-- roleForColumn/flowRoleForColumn now return for Manpower Schedule "Exec N"
-- seat columns, which are always branch-context.

UPDATE "User" SET "employmentType" = 'Branch Exec'
WHERE "employmentType" = 'Executive' AND "branch" IS NOT NULL;

UPDATE "User" SET "employmentType" = 'HQ Exec'
WHERE "employmentType" = 'Executive' AND "department" IS NOT NULL;
