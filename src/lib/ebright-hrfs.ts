import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

type PoolCacheEntry = { signature: string; pool: Pool };
const globalForPool = globalThis as unknown as {
  __ebright_hrfs_pool?: PoolCacheEntry;
};

function configSignature(): string {
  return process.env.HRFS_DATABASE_URL ?? "";
}

function makePool(): Pool {
  const connectionString = process.env.HRFS_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "HRFS_DATABASE_URL env var missing. Restart dev server after editing .env.",
    );
  }
  return new Pool({
    connectionString,
    // HR Dashboard fires ~12 parallel queries (6 cards × 1-3 queries each),
    // and the Summary/Report make 3-5 more — bumped from 5 to 20 so they
    // don't queue past the connect timeout.
    max: 20,
    idleTimeoutMillis: 30000,
    // Bumped from 5s — the MedicalLeave LEFT JOIN subquery is heavier than
    // a plain leave fetch and was hitting the 5s pool-wait window on the
    // 5th+ concurrent query.
    connectionTimeoutMillis: 15000,
  });
}

function getPool(): Pool {
  const signature = configSignature();
  const cached = globalForPool.__ebright_hrfs_pool;
  if (cached && cached.signature === signature) {
    return cached.pool;
  }
  if (cached) {
    cached.pool.end().catch(() => {});
  }
  const pool = makePool();
  if (process.env.NODE_ENV !== "production") {
    globalForPool.__ebright_hrfs_pool = { signature, pool };
  }
  return pool;
}

export async function queryEbrightHrfs<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return (await getPool().query(sql, params as never)) as QueryResult<T>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ebright_hrfs] Query error:", msg);
    throw new Error(`Failed to query ebright_hrfs: ${msg}`);
  }
}
