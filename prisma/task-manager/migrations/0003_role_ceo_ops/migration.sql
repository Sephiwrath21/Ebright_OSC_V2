-- Role-scoped analytics (ANALYTICS_BRIEF.md "Role-scoped views"): the role-site
-- mockups distinguish CEO and Operations from the superadmin (ADMIN). New values
-- are only ADDED here, never used — Postgres 12+ allows that inside the
-- migration transaction.
ALTER TYPE "Role" ADD VALUE 'CEO';
ALTER TYPE "Role" ADD VALUE 'OPS';
