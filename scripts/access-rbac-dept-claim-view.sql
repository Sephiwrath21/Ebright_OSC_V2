-- ─────────────────────────────────────────────────────────────
-- Claims visibility for the OPS / MKT / ACD department heads.
--
-- The department role only ever had `claim` rows for the FNC and HR subtypes,
-- so operations@ / marketing@ / academy@ saw no Claims nav item and an empty
-- /claim page — not even their own claims.
--
-- Grants them `claim.view` at `team` scope, which for a department-role actor
-- resolves to their own department (see Access.constraint() in
-- src/lib/access/engine.ts) — i.e. their own claims by default, plus their
-- department's staff via the "My team" toggle. Also grants `claim.add` at
-- `own` scope so the matrix matches what the submit form already allows.
--
-- Idempotent. Run AFTER deploying the engine.ts change that maps `team` →
-- department for the department role.
-- ─────────────────────────────────────────────────────────────

BEGIN;

INSERT INTO role_permission (role_id, subtype, feature_key, action, allowed, scope, updated_at)
SELECT r.role_id, st.subtype, 'claim', g.action, true, g.scope, now()
FROM role r
CROSS JOIN (VALUES ('OPS'), ('MKT'), ('ACD')) AS st(subtype)
CROSS JOIN (VALUES ('view', 'team'), ('add', 'own')) AS g(action, scope)
WHERE lower(r.role_type) = 'department'
ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING;

COMMIT;

-- Verify: expect 6 rows (3 subtypes × view/add).
--   SELECT subtype, action, scope, allowed FROM role_permission rp
--     JOIN role r ON r.role_id = rp.role_id
--    WHERE lower(r.role_type) = 'department' AND rp.feature_key = 'claim'
--    ORDER BY subtype, action;
