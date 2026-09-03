-- ─────────────────────────────────────────────────────────────
-- Access RBAC — Phase 1: schema + region backfill + policy seed
--
-- Creates role_permission (the DB-editable capability+scope matrix),
-- backfills branch.region from the authoritative A/B/C code map, and seeds
-- the starting policy as EDITABLE rows (superadmin can change any of them later
-- from the Access Management UI).
--
-- Model:
--   role_permission(role_id, subtype, feature_key, action, allowed, scope)
--   subtype = ''  → applies to the whole role (no sub-type)
--   subtype = department_code (MKT/FNC/ACD/OPS/HR) for the `department` role
--   subtype = position (FT COACH / PT COACH / …) for the `staff` role
--   scope   = global | region | branch | team | own
--
-- NOT seeded (implicit in code, enforced first): superadmin (all/global/CRUD),
-- ceo (all/global/view), and the superadmin-only ceiling.
--
-- Idempotent. RUN ON STAGING FIRST. After running: `prisma db pull` +
-- `prisma generate` so the client learns the new table.
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1) Schema ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permission (
  id          SERIAL       PRIMARY KEY,
  role_id     INTEGER      NOT NULL REFERENCES role(role_id),
  subtype     VARCHAR(30)  NOT NULL DEFAULT '',   -- '' = whole role
  feature_key VARCHAR(40)  NOT NULL,
  action      VARCHAR(10)  NOT NULL,              -- view|add|update|delete|export
  allowed     BOOLEAN      NOT NULL DEFAULT false,
  scope       VARCHAR(10)  NOT NULL DEFAULT 'own',-- global|region|branch|team|own
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_permission UNIQUE (role_id, subtype, feature_key, action)
);
CREATE INDEX IF NOT EXISTS idx_role_permission_lookup
  ON role_permission (role_id, subtype);

-- 2) Backfill branch.region from the authoritative A/B/C code map -----------
--    (src/lib/pcm/types.ts REGION_BRANCH_CODES). Safe to re-run.
UPDATE branch SET region = 'A'
  WHERE branch_code IN ('AC','DA','EGR','KLG','RBY','SA','SHA','ST','SBY');
UPDATE branch SET region = 'B'
  WHERE branch_code IN ('AMP','BTHO','DK','DSH','KTG','KD','SLY','SP','TSG');
UPDATE branch SET region = 'C'
  WHERE branch_code IN ('BBB','BSP','CJY','DP','KW','PJY','SNT','SBN','ONL');

-- 3) Seed the policy as editable rows --------------------------------------
--    Only ALLOWED grants are inserted; any (role,subtype,feature,action) with
--    no row = not allowed. actions are expanded from a CSV per line.
--      CRUD  = view,add,update,delete
--      report= view,export
INSERT INTO role_permission (role_id, subtype, feature_key, action, scope, allowed)
SELECT v.role_id, v.subtype, v.feature_key, trim(a.action), v.scope, true
FROM (VALUES
  -- department role (3), by department_code -------------------------------
  (3,'MKT','fa',                'view,add,update,delete','global'),
  (3,'FNC','claim',             'view,add,update,delete','global'),
  (3,'FNC','manpower_cost',     'view,export',           'global'),
  (3,'ACD','pcm',               'view,add,update,delete','global'),
  (3,'OPS','cns',               'view,add,update,delete','global'),
  (3,'HR','employee_dashboard', 'view,add,update,delete','global'),
  (3,'HR','employee_folder',    'view,add,update,delete','global'),
  (3,'HR','manpower_archive',   'view,add,update,delete','global'),
  (3,'HR','manpower_cost',      'view,export',           'global'),
  (3,'HR','claim',              'view,add,update,delete','global'),
  (3,'HR','attendance_report',  'view,export',           'global'),
  (3,'HR','hr_dashboard',       'view,export',           'global'),

  -- branch (4) — branch-scoped -------------------------------------------
  (4,'','cns',           'view,add,update,delete','branch'),
  (4,'','fa',            'view,add,update,delete','branch'),
  (4,'','pcm',           'view,add,update,delete','branch'),
  (4,'','manpower_plan', 'view,add,update,delete','branch'),
  (4,'','manpower_cost', 'view,export',           'branch'),
  (4,'','claim',         'view',                  'team'),
  (4,'','leave',         'view',                  'team'),

  -- Branch Manager (8) — identical to branch ------------------------------
  (8,'','cns',           'view,add,update,delete','branch'),
  (8,'','fa',            'view,add,update,delete','branch'),
  (8,'','pcm',           'view,add,update,delete','branch'),
  (8,'','manpower_plan', 'view,add,update,delete','branch'),
  (8,'','manpower_cost', 'view,export',           'branch'),
  (8,'','claim',         'view',                  'team'),
  (8,'','leave',         'view',                  'team'),

  -- regional manager (5) --------------------------------------------------
  (5,'','cns',              'view,add,update,delete','region'),
  (5,'','manpower_update',  'view,add,update,delete','global'),
  (5,'','manpower_archive', 'view,add,update,delete','global'),

  -- staff (6): baseline for all positions ---------------------------------
  (6,'','claim', 'view','own'),
  (6,'','leave', 'view','own'),
  -- staff · coach / protégé (branch-scoped CRUD on the 3 systems) ----------
  (6,'FT COACH','cns','view,add,update,delete','branch'),
  (6,'FT COACH','fa', 'view,add,update,delete','branch'),
  (6,'FT COACH','pcm','view,add,update,delete','branch'),
  (6,'FT COACH','attendance_report','view','own'),
  (6,'FT COACH','manpower_cost',    'view','own'),
  (6,'PT COACH','cns','view,add,update,delete','branch'),
  (6,'PT COACH','fa', 'view,add,update,delete','branch'),
  (6,'PT COACH','pcm','view,add,update,delete','branch'),
  (6,'PT COACH','attendance_report','view','own'),
  (6,'PT COACH','manpower_cost',    'view','own'),
  (6,'PROTEGE INTERN','cns','view,add,update,delete','branch'),
  (6,'PROTEGE INTERN','fa', 'view,add,update,delete','branch'),
  (6,'PROTEGE INTERN','pcm','view,add,update,delete','branch'),
  (6,'PROTEGE INTERN','attendance_report','view','own'),
  (6,'PROTEGE INTERN','manpower_cost',    'view','own'),
  -- staff · exec / HQ intern (attendance report of own only) --------------
  (6,'FT EXEC','attendance_report','view','own'),
  (6,'HQ INTERN','attendance_report','view','own'),

  -- hod (7): own + department-team (toggle) -------------------------------
  (7,'','attendance_report','view','team'),
  (7,'','claim',            'view','team'),
  (7,'','leave',            'view','team')
) AS v(role_id, subtype, feature_key, actions, scope)
CROSS JOIN LATERAL unnest(string_to_array(v.actions, ',')) AS a(action)
ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING;

COMMIT;

-- ── Verify (read-only) ────────────────────────────────────────────────────
-- SELECT r.role_type, rp.subtype, rp.feature_key,
--        string_agg(rp.action, ',' ORDER BY rp.action) AS actions, rp.scope
-- FROM role_permission rp JOIN role r ON r.role_id = rp.role_id
-- GROUP BY r.role_type, rp.subtype, rp.feature_key, rp.scope
-- ORDER BY r.role_id, rp.subtype, rp.feature_key;
--
-- SELECT region, count(*)::int FROM branch GROUP BY region ORDER BY region;
