import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

// Read-only connection to ebright_crm (the live v1 CNS/CRM database).
//
// This is a *reporting* link only: the v2 dashboards read aggregate lead
// metrics straight from the tables v1 already populates (crm_opportunity,
// crm_stage_history, crm_appointment, crm_branch). We never write here and we
// never touch the schema — v1 owns both. Mirrors the pooling/fallback pattern
// in lib/leads-db.ts so a missing CRM_DATABASE_URL degrades gracefully
// (isCrmAvailable() → false, queries return null) instead of crashing.
//
// Tables live in the `crm` Postgres schema and use camelCase column names
// (Prisma @@map on tables, no @map on columns), so every query MUST schema-
// qualify tables (crm.crm_opportunity) and double-quote columns ("branchId").

type PoolCacheEntry = { signature: string; pool: Pool };
const globalForPool = globalThis as unknown as {
  __crm_db_pool?: PoolCacheEntry;
};

function urlFromEnv(): string | null {
  return process.env.CRM_DATABASE_URL ?? null;
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
  const cached = globalForPool.__crm_db_pool;
  if (cached && cached.signature === signature) return cached.pool;
  if (cached) cached.pool.end().catch(() => {});
  const pool = makePool();
  if (!pool) return null;
  if (process.env.NODE_ENV !== "production") {
    globalForPool.__crm_db_pool = { signature, pool };
  }
  return pool;
}

export function isCrmAvailable(): boolean {
  return urlFromEnv() !== null;
}

export async function queryCrmDb<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T> | null> {
  const pool = getPool();
  if (!pool) return null;
  try {
    return (await pool.query(sql, params as never)) as QueryResult<T>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[crm_db] Query error:", msg);
    throw new Error(`Failed to query crm_db: ${msg}`);
  }
}
