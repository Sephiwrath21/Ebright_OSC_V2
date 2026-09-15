-- ─────────────────────────────────────────────────────────────
-- Stop recording client IP addresses in the audit log.
--
-- Decision, 2026-09-15: IPs are no longer collected at all. The capture was
-- removed from src/lib/audit/context.ts, the field from the writer, the API
-- response and the CSV export — this drops the column so it cannot be written
-- again without a deliberate migration, and so the values already captured
-- stop existing.
--
-- DESTRUCTIVE: dropping the column discards whatever IPs are stored. That is
-- the point — leaving them in place would mean the data is still held, which
-- is precisely what "don't record it" is meant to prevent. There is no undo,
-- and no backup of these values is taken.
--
-- Idempotent: DROP COLUMN IF EXISTS, so a re-run is a no-op.
--
--   psql "$DATABASE_URL" -f prisma/manual-sql/drop_audit_log_ip_address.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE audit_log DROP COLUMN IF EXISTS ip_address;

COMMIT;

-- Verify: expect zero rows.
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'audit_log' AND column_name = 'ip_address';
