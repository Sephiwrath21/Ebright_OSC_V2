-- ─────────────────────────────────────────────────────────────
-- Access RBAC — Phase 2: break coarse modules into per-page features.
--
-- The Access Management matrix now lists each module's sub-pages (CNS ·
-- Contacts, FA · Events, …) instead of one coarse row per module. This
-- migration preserves existing access by copying every current cns/fa/pcm
-- grant onto ALL of that module's new per-page keys (same action/scope/allowed),
-- then removing the old coarse rows.
--
-- Idempotent. RUN ON STAGING FIRST. Run AFTER deploying the code that defines
-- the new feature keys (src/lib/access/types.ts).
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1) Expand coarse grants → new per-page keys, preserving action/scope/allowed.
INSERT INTO role_permission (role_id, subtype, feature_key, action, allowed, scope, updated_at)
SELECT rp.role_id, rp.subtype, nk.new_key, rp.action, rp.allowed, rp.scope, now()
FROM role_permission rp
JOIN (VALUES
  -- CNS · Lead
  ('cns','cns_dashboard'), ('cns','cns_contacts'), ('cns','cns_opportunities'),
  ('cns','cns_forms'), ('cns','cns_branches'), ('cns','cns_region'),
  ('cns','cns_automations'), ('cns','cns_analytics'), ('cns','cns_integrations'),
  -- CNS · Ticket
  ('cns','cns_ticket_dashboard'), ('cns','cns_ticket_opportunities'),
  ('cns','cns_ticket_my'), ('cns','cns_ticket_new'), ('cns','cns_ticket_platforms'),
  -- FA System
  ('fa','fa_dashboard'), ('fa','fa_events'), ('fa','fa_inventory'),
  ('fa','fa_student_list'), ('fa','fa_reports'), ('fa','fa_attendance'),
  -- PCM System
  ('pcm','pcm_dashboard'), ('pcm','pcm_events'), ('pcm','pcm_student_list'),
  ('pcm','pcm_invitations'), ('pcm','pcm_reports'), ('pcm','pcm_attendance')
) AS nk(old_key, new_key) ON nk.old_key = rp.feature_key
ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING;

-- 2) Drop the now-replaced coarse rows.
DELETE FROM role_permission WHERE feature_key IN ('cns', 'fa', 'pcm');

COMMIT;

-- Verify: expect cns_*/fa_*/pcm_* rows, and zero rows for the old keys.
--   SELECT feature_key, count(*) FROM role_permission
--    WHERE feature_key LIKE 'cns_%' OR feature_key LIKE 'fa_%' OR feature_key LIKE 'pcm_%'
--    GROUP BY 1 ORDER BY 1;
--   SELECT count(*) FROM role_permission WHERE feature_key IN ('cns','fa','pcm'); -- 0
