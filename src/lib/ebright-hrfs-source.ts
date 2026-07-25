import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

// Query helper for the **ebright_hrfs** source DB — the database that actually
// holds the raw Hikvision scan log (`hikvision_attendance_all`), its id-map,
// and the HRFS leave/justification tables.
//
// NOTE: this is deliberately separate from `@/lib/ebright-hrfs` (queryEbrightHrfs),
// which — despite its name — connects to HRFS_DATABASE_URL (the portal `hrfs`
// DB). Those attendance tables do NOT exist in `hrfs`; they only exist here.
// Always read scans/leave from this helper.

type PoolCacheEntry = { signature: string; pool: Pool };
const globalForPool = globalThis as unknown as {
  __ebright_hrfs_source_pool?: PoolCacheEntry;
};

function connectionString(): string {
  const cs = process.env.EBRIGHT_HRFS_DATABASE_URL;
  if (!cs) {
    throw new Error(
      "EBRIGHT_HRFS_DATABASE_URL env var missing — points at the ebright_hrfs DB " +
        "(hikvision_attendance_all + BranchStaff/LeaveTransaction). Add it to .env and restart.",
    );
  }
  return cs;
}

function getPool(): Pool {
  const signature = connectionString();
  const cached = globalForPool.__ebright_hrfs_source_pool;
  if (cached && cached.signature === signature) return cached.pool;
  if (cached) cached.pool.end().catch(() => {});
  const pool = new Pool({
    connectionString: signature,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });
  if (process.env.NODE_ENV !== "production") {
    globalForPool.__ebright_hrfs_source_pool = { signature, pool };
  }
  return pool;
}

export async function queryEbrightHrfsSource<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return (await getPool().query(sql, params as never)) as QueryResult<T>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ebright_hrfs_source] Query error:", msg);
    throw new Error(`Failed to query ebright_hrfs source: ${msg}`);
  }
}
