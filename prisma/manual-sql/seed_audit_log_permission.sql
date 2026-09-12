-- ─────────────────────────────────────────────────────────────
-- Grants for the `audit_log` feature (Access Management → System → Audit Log).
--
-- Seeds view + export at `global` scope for superadmin and CEO only. Both
-- roles are short-circuited inside Access.can() before any grant is consulted
-- (superadmin gets everything, CEO gets every `view`), so these rows change no
-- behaviour on their own — they exist so the Access Management matrix shows
-- the real, intended state rather than an empty row, and so the grants are
-- already in place if those short-circuits are ever narrowed.
--
-- To give anyone else access, tick the boxes in Access Management rather than
-- editing this file — that is the whole point of the feature being RBAC-backed.
--
-- Idempotent. Run AFTER prisma/manual-sql/add_audit_log.sql.
--
--   psql "$DATABASE_URL" -f prisma/manual-sql/seed_audit_log_permission.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

INSERT INTO role_permission (role_id, subtype, feature_key, action, allowed, scope, updated_at)
SELECT r.role_id, '', 'audit_log', g.action, true, 'global', now()
FROM role r
CROSS JOIN (VALUES ('view'), ('export')) AS g(action)
WHERE lower(r.role_type) IN ('superadmin', 'ceo')
ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING;

COMMIT;

-- Verify: expect 4 rows (2 roles × view/export).
--   SELECT r.role_type, rp.action, rp.scope, rp.allowed
--     FROM role_permission rp
--     JOIN role r ON r.role_id = rp.role_id
--    WHERE rp.feature_key = 'audit_log'
--    ORDER BY r.role_type, rp.action;
