-- ─────────────────────────────────────────────────────────────
-- Normalize employment.position to a canonical set.
--
-- employment.position is a free-text VARCHAR(100) with no constraint, so it has
-- drifted (e.g. "FT COACH" vs "Full-Time Coach", "PT COACH" vs "Part-Time",
-- "admin" vs "ADMIN"). This standardizes it to the app's canonical short codes
-- (the EmployeeForm ROLE_OPTIONS vocabulary):
--
--   FT CEO · FT HOD · FT EXEC · BM · FT COACH · PT COACH · INTERN · ADMIN
--
-- Confirmed mapping decisions:
--   • "Part-Time" (standalone)  → PT COACH
--   • "admin"                   → ADMIN   (app writer fixed in profile/actions.ts)
--   • style                     → short codes
--
-- RUN ON STAGING FIRST. The environment this repo runs in cannot reach the DB,
-- so run this where psql can (see scripts/deploy-staging.sh / SSH endpoints).
-- Run sections 1–2 (read-only) first, eyeball the output, then section 3.
-- ─────────────────────────────────────────────────────────────


-- ── Section 1: INSPECT — every raw value and how many rows have it ───────────
-- (Run this first. If you see a variant NOT covered by the mapping below,
--  tell me and I'll add it before you run section 3.)
SELECT
  position                    AS raw_value,
  upper(btrim(position))       AS normalized_key,
  count(*)::int               AS rows
FROM employment
GROUP BY position
ORDER BY rows DESC, position;


-- ── The canonical mapping (used by sections 2 and 3) ─────────────────────────
-- Keyed on upper(btrim(position)) so case/whitespace variants collapse for free.
-- To preview or apply, this VALUES list is referenced below.
--   variant (already upper+trimmed)   → canonical
--   'FT CEO'                          → 'FT CEO'
--   'FT HOD'                          → 'FT HOD'
--   'FT EXEC'                         → 'FT EXEC'
--   'BM' / 'BRANCH MANAGER'           → 'BM'
--   'FT COACH' / 'FULL-TIME COACH' / 'FULL TIME COACH' → 'FT COACH'
--   'PT COACH' / 'PART-TIME COACH' / 'PART TIME COACH' / 'PART-TIME' / 'PART TIME' → 'PT COACH'
--   'INTERN' / 'INTERNSHIP'           → 'INTERN'
--   'ADMIN'                           → 'ADMIN'


-- ── Section 2: DRY RUN — rows that WOULD change (before → after) ──────────────
SELECT
  e.employment_id,
  e.position          AS before,
  m.canonical         AS after,
  count(*) OVER (PARTITION BY e.position, m.canonical) AS same_change_count
FROM employment e
JOIN (VALUES
  ('FT CEO','FT CEO'),
  ('FT HOD','FT HOD'),
  ('FT EXEC','FT EXEC'),
  ('BM','BM'),
  ('BRANCH MANAGER','BM'),
  ('FT COACH','FT COACH'),
  ('FULL-TIME COACH','FT COACH'),
  ('FULL TIME COACH','FT COACH'),
  ('PT COACH','PT COACH'),
  ('PART-TIME COACH','PT COACH'),
  ('PART TIME COACH','PT COACH'),
  ('PART-TIME','PT COACH'),
  ('PART TIME','PT COACH'),
  ('INTERN','INTERN'),
  ('INTERNSHIP','INTERN'),
  ('ADMIN','ADMIN')
) AS m(variant, canonical) ON upper(btrim(e.position)) = m.variant
WHERE e.position IS DISTINCT FROM m.canonical   -- only genuine changes
ORDER BY before, after;


-- ── Section 3: APPLY (transactional — inspect leftovers, then COMMIT) ─────────
BEGIN;

UPDATE employment e
SET position = m.canonical
FROM (VALUES
  ('FT CEO','FT CEO'),
  ('FT HOD','FT HOD'),
  ('FT EXEC','FT EXEC'),
  ('BM','BM'),
  ('BRANCH MANAGER','BM'),
  ('FT COACH','FT COACH'),
  ('FULL-TIME COACH','FT COACH'),
  ('FULL TIME COACH','FT COACH'),
  ('PT COACH','PT COACH'),
  ('PART-TIME COACH','PT COACH'),
  ('PART TIME COACH','PT COACH'),
  ('PART-TIME','PT COACH'),
  ('PART TIME','PT COACH'),
  ('INTERN','INTERN'),
  ('INTERNSHIP','INTERN'),
  ('ADMIN','ADMIN')
) AS m(variant, canonical)
WHERE upper(btrim(e.position)) = m.variant
  AND e.position IS DISTINCT FROM m.canonical;

-- Any positions left that are NOT canonical and NOT null? These were not covered
-- by the mapping. If this returns rows, ROLLBACK and send them to me.
SELECT position, count(*)::int AS rows
FROM employment
WHERE position IS NOT NULL
  AND position NOT IN ('FT CEO','FT HOD','FT EXEC','BM','FT COACH','PT COACH','INTERN','ADMIN')
GROUP BY position
ORDER BY rows DESC;

-- If the leftover check above is empty (or acceptable):
COMMIT;
-- Otherwise:
-- ROLLBACK;
