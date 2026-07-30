-- Fix: several department/branch-scoped login accounts (role_type
-- "department"/"branch") had ZERO employment rows, so the new Employee
-- Overview/Record scope rule (see src/lib/employeeScope.ts) had no
-- department_id/branch_id to filter on for them. These are shared/system
-- logins, not real people (see attendance/summary/page.tsx's own comment:
-- "generic/shared logins — superadmin(1), department(3), branch(4) — ...
-- aren't people" — confirmed these are already excluded from every
-- attendance/working-hours query that matters, either by role_id filter or
-- by requiring a non-null employee_id, so adding a minimal employment row
-- here purely for scope purposes does not make them appear as "employees"
-- anywhere else in the app).
--
-- Each row: department_id set (and branch_id left NULL) for department
-- accounts; branch_id set (and department_id left NULL) for branch accounts
-- — matches the confirmed scope precedence (department first, branch only
-- when no department is set). employee_id/position/employment_type/rate
-- deliberately left NULL — not real attendance-tracked staff.
--
-- Project has no prisma/migrations folder (schema-first), so this is applied
-- manually and kept here as the record. Idempotent — safe to re-run (each
-- INSERT is guarded by "this user has no employment row yet").

-- ─── Department accounts ───

INSERT INTO employment (user_id, department_id, status)
SELECT u.user_id, d.department_id, 'active'
FROM users u, department d
WHERE u.email = 'academy@ebright.my' AND d.department_code = 'ACD'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, department_id, status)
SELECT u.user_id, d.department_id, 'active'
FROM users u, department d
WHERE u.email = 'marketing@ebright.my' AND d.department_code = 'MKT'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, department_id, status)
SELECT u.user_id, d.department_id, 'active'
FROM users u, department d
WHERE u.email = 'operations@ebright.my' AND d.department_code = 'OPS'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

-- ─── Branch accounts (19 of the 20 broken — ebrighttropicanasungaibuloh@
-- gmail.com has no matching branch row anywhere in the branch table,
-- flagged separately rather than guessed) ───

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightputrajaya@gmail.com' AND b.branch_code = 'PJY'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightampang@gmail.com' AND b.branch_code = 'AMP'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightcyberjaya@gmail.com' AND b.branch_code = 'CJY'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightdenaialam@gmail.com' AND b.branch_code = 'DA'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightdanaukota@gmail.com' AND b.branch_code = 'DK'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightshahalam@gmail.com' AND b.branch_code = 'SHA'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightbandartunhusseinonn@gmail.com' AND b.branch_code = 'BTHO'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightecograndeur@gmail.com' AND b.branch_code = 'EGR'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightbandarseriputra@gmail.com' AND b.branch_code = 'BSP'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightbandarrimbayu@gmail.com' AND b.branch_code = 'RBY'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrighttamansrigombak@gmail.com' AND b.branch_code = 'TSG'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightkotawarisan@gmail.com' AND b.branch_code = 'KW'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightttdigrove@gmail.com' AND b.branch_code = 'KTG'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightbandarbarubangi@gmail.com' AND b.branch_code = 'BBB'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightonline@gmail.com' AND b.branch_code = 'ONL'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightsubangtaipan@gmail.com' AND b.branch_code = 'ST'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightsetiaalam@gmail.com' AND b.branch_code = 'SA'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightsripetaling@gmail.com' AND b.branch_code = 'SP'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);

INSERT INTO employment (user_id, branch_id, status)
SELECT u.user_id, b.branch_id, 'active'
FROM users u, branch b
WHERE u.email = 'ebrightkotadamansara@gmail.com' AND b.branch_code = 'KD'
  AND NOT EXISTS (SELECT 1 FROM employment e WHERE e.user_id = u.user_id);
