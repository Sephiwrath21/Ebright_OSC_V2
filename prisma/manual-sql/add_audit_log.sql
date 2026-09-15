-- ─────────────────────────────────────────────────────────────
-- Site-wide audit trail (audit_log).
--
-- Additive and idempotent — safe to re-run. Applied by hand rather than with
-- `prisma db push`, which fails on this database's pre-existing drift and
-- would offer to reset it. Mirrors the audit_log model in prisma/schema.prisma;
-- keep the two in step.
--
-- Written by:
--   src/lib/audit/extension.ts  — every create/update/delete on the portal client
--   src/lib/audit/log.ts        — logins, logouts, failed logins, exports
-- Read by:    /audit-log  (superadmin + CEO, via the audit_log RBAC feature)
--
-- RETENTION: entries are kept indefinitely. scripts/prune-audit-log.ts exists
-- but is deliberately NOT scheduled anywhere — no cron, no workflow, no npm
-- script — so nothing is ever deleted unless someone runs it by hand
-- (decision, 2026-09-15). The trade-off accepted with that: the table grows
-- without bound, which matters here because the log captures automated writes
-- too and the attendance sync is by far the largest writer. Revisit by
-- scheduling the script, not by deleting rows ad hoc.
--
--   psql "$DATABASE_URL" -f prisma/manual-sql/add_audit_log.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  occurred_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- users.user_id. Intentionally NOT a foreign key: the trail must survive the
  -- deletion of the account that made the change, and actor_email/actor_name
  -- are denormalised here for exactly that reason.
  actor_id    INTEGER,
  actor_email VARCHAR(255),
  actor_name  VARCHAR(255),
  actor_role  VARCHAR(50),
  actor_type  VARCHAR(10)  NOT NULL DEFAULT 'user',

  action      VARCHAR(20)  NOT NULL,
  entity      VARCHAR(64)  NOT NULL,
  entity_id   VARCHAR(128),
  row_count   INTEGER      NOT NULL DEFAULT 1,

  before      JSONB,
  after       JSONB,
  changed     TEXT[]       NOT NULL DEFAULT '{}',

  summary     TEXT,
  route       VARCHAR(255),
  user_agent  TEXT
);

-- Newest-first listing, the default query.
CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at
  ON audit_log (occurred_at DESC);

-- "What has this person done?"
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON audit_log (actor_id, occurred_at DESC);

-- "What has happened to this record?"
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log (entity, entity_id, occurred_at DESC);

-- Filtering by CREATE/UPDATE/DELETE/LOGIN/...
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log (action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_type
  ON audit_log (actor_type, occurred_at DESC);

-- The UI's default view is human activity only. The Hikvision attendance sync
-- writes system rows in far greater volume than people generate, so the
-- default view gets an index that skips them entirely.
CREATE INDEX IF NOT EXISTS idx_audit_log_user_activity
  ON audit_log (occurred_at DESC)
  WHERE actor_type = 'user';

COMMIT;

-- Verify:
--   \d+ audit_log
--   SELECT count(*) FROM audit_log;
