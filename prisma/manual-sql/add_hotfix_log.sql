-- ─────────────────────────────────────────────────────────────
-- Hotfix / changelog log (hotfix_log).
--
-- "What's new, what's fixed" on the portal, derived from commits on `main` by
-- scripts/sync-changelog.ts, which runs on the production server at deploy
-- time (see .github/workflows/deploy.yml).
--
-- Applied by hand rather than with `prisma db push`, which fails on this
-- database's pre-existing drift. Mirrors the hotfix_log model in
-- prisma/schema.prisma; keep the two in step.
--
-- NOTE ON THE DROP BELOW: an earlier revision of this file created a
-- hand-entry version of this table (title/details/type/shipped_on/created_by).
-- It only ever existed empty — the changelog became GitHub-sourced before a
-- single row was written — so this replaces it outright instead of carrying a
-- migration for a shape nothing ever used. The guard makes that explicit: the
-- drop happens ONLY if the table is empty, so if this is ever run against a
-- populated table it fails loudly rather than destroying data.
--
-- Access: superadmin only, enforced in code through ACTION_CEILINGS in
-- src/lib/access/types.ts. There is deliberately NO role_permission seed —
-- the ceiling is checked before any grant, so a grant row would imply access
-- could be handed out from the Access Management UI, which it cannot.
--
--   psql "$DATABASE_URL" -f prisma/manual-sql/add_hotfix_log.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE
  existing_rows BIGINT;
BEGIN
  IF to_regclass('public.hotfix_log') IS NULL THEN
    RETURN;  -- nothing to replace
  END IF;

  -- Already the new shape? Then this is a re-run; leave it alone.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'hotfix_log' AND column_name = 'commit_sha'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM hotfix_log' INTO existing_rows;
  IF existing_rows > 0 THEN
    RAISE EXCEPTION
      'hotfix_log holds % row(s) in the old hand-entry shape. Refusing to drop it — migrate those rows by hand first.',
      existing_rows;
  END IF;

  DROP TABLE hotfix_log;
END $$;

CREATE TABLE IF NOT EXISTS hotfix_log (
  id         SERIAL       PRIMARY KEY,

  -- ── Owned by scripts/sync-changelog.ts; overwritten on every run ──────────
  -- Full commit SHA. UNIQUE is what makes the sync an upsert, and therefore
  -- safe to re-run and safe to backfill with.
  commit_sha  VARCHAR(40)  NOT NULL UNIQUE,
  -- Commit date: the day the change shipped, and the changelog's grouping key.
  shipped_on  DATE         NOT NULL,
  -- Portal area, derived from the commit's changed paths.
  category    VARCHAR(40)  NOT NULL,
  -- ADDED | FIXED | UPDATED. Plain varchar rather than an enum so adding a tag
  -- later is a code change, not a migration.
  tag         VARCHAR(10)  NOT NULL,
  -- Commit subject with any conventional-commit prefix stripped.
  title       VARCHAR(300) NOT NULL,
  details     TEXT         NOT NULL DEFAULT '',
  author_name VARCHAR(200),

  -- ── Owned by people; the sync NEVER writes these after the first insert ──
  -- A reworded title. NULL means "show what the sync derived".
  title_override VARCHAR(300),
  -- Hidden from the default view. Seeded by the sync on first insert for CI
  -- and deploy noise, and owned by the curator from then on.
  hidden         BOOLEAN     NOT NULL DEFAULT FALSE,
  curated_by     INTEGER,
  curated_at     TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ON DELETE SET NULL: an entry outlives the account that curated it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_hotfix_log_curator'
  ) THEN
    ALTER TABLE hotfix_log
      ADD CONSTRAINT fk_hotfix_log_curator
      FOREIGN KEY (curated_by) REFERENCES users (user_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Newest-shipped first, the default listing.
CREATE INDEX IF NOT EXISTS idx_hotfix_log_shipped_on
  ON hotfix_log (shipped_on DESC);

CREATE INDEX IF NOT EXISTS idx_hotfix_log_category
  ON hotfix_log (category);

-- The default view excludes hidden rows.
CREATE INDEX IF NOT EXISTS idx_hotfix_log_hidden
  ON hotfix_log (hidden);

COMMIT;

-- Verify:
--   \d+ hotfix_log
--   SELECT shipped_on, category, tag, title FROM hotfix_log
--     WHERE NOT hidden ORDER BY shipped_on DESC LIMIT 20;
