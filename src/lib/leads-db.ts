import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

// Connection to ebrightleads_db (the FA / leads database).
// Only used for `autocount_employee_map` and the `hrfs` foreign schema today.
// If LEADS_DB_URL is not set (env not yet configured on a server), every
// query returns an empty result and `isLeadsAvailable()` returns false so
// callers can fall back gracefully — the HR Dashboard's name resolution
// chain handles this by just using BranchStaff names.

type PoolCacheEntry = { signature: string; pool: Pool };
const globalForPool = globalThis as unknown as {
  __leads_db_pool?: PoolCacheEntry;
};

function urlFromEnv(): string | null {
  // Preferred: single connection string.
  const direct = process.env.LEADS_DB_URL ?? process.env.FA_DATABASE_URL;
  if (direct) return direct;
  // Fall back to legacy 5-piece form (EBRIGHTLEADS_HOST/PORT/USER/PASSWORD/DATABASE)
  // that's already in this codebase for the sync-onboarding job.
  const host = process.env.EBRIGHTLEADS_HOST;
  const port = process.env.EBRIGHTLEADS_PORT;
  const user = process.env.EBRIGHTLEADS_USER;
  const password = process.env.EBRIGHTLEADS_PASSWORD;
  const database = process.env.EBRIGHTLEADS_DATABASE;
  if (host && port && user && password && database) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }
  return null;
}

function configSignature(): string {
  return urlFromEnv() ?? "";
}

function makePool(): Pool | null {
  const url = urlFromEnv();
  if (!url) return null;
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

function getPool(): Pool | null {
  const signature = configSignature();
  if (!signature) return null;
  const cached = globalForPool.__leads_db_pool;
  if (cached && cached.signature === signature) return cached.pool;
  if (cached) cached.pool.end().catch(() => {});
  const pool = makePool();
  if (!pool) return null;
  if (process.env.NODE_ENV !== "production") {
    globalForPool.__leads_db_pool = { signature, pool };
  }
  return pool;
}

export function isLeadsAvailable(): boolean {
  return urlFromEnv() !== null;
}

export async function queryLeadsDb<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T> | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    return (await pool.query(sql, params as never)) as QueryResult<T>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[leads_db] Query error:", msg);
    throw new Error(`Failed to query leads_db: ${msg}`);
  }
}
