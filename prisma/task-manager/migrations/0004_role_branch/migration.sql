-- Branch site (ANALYTICS_BRIEF.md §Role-scoped views): a branch-manager role
-- scoped to its own branch (daily/monthly branch status + ad hoc tasks),
-- parallel to how HOD is scoped to a department.
ALTER TYPE "Role" ADD VALUE 'BRANCH';
