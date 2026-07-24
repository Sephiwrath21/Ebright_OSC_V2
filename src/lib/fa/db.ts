import "server-only";
import { Pool } from "pg";

// FA System reads from a different DB than the rest of OSC: studentrecords +
// fa_* tables live in `ebrightleads_db` (the CRM/leads database), whereas the
// OSC main portal uses `ebright_hrfs`. We try the FA-specific name first, then
// the shared leads name, then the last-resort main DATABASE_URL. Mirrors the
// v1 fa-system/_lib/db.ts so the ported *.server.ts modules keep `pool.query`.
//
// Note on schemas: fa_assessment_reports and fa_event_branch_overrides live in
// the `crm` Postgres schema; the rest (fa_events/fa_sessions/fa_session_quotas/
// fa_invitations, studentrecords, archived_students) live in `public`. The
// connection's search_path spans both, so unqualified table names resolve — we
// keep v1's unqualified SQL, which is already proven against this exact DB.

declare global {
  // eslint-disable-next-line no-var
  var __faPgPool: Pool | undefined;
}

function makePool(): Pool {
  const url =
    process.env.FA_DATABASE_URL ||
    process.env.LEADS_DB_URL ||
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "FA database connection string is not set. Define one of " +
        "FA_DATABASE_URL, LEADS_DB_URL, or DATABASE_URL in the environment.",
    );
  }
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pool: Pool = globalThis.__faPgPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__faPgPool = pool;
