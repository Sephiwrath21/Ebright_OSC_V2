import "server-only";
import { Pool } from "pg";

// PCM (Pro-Class Mastery) reads from the same `ebrightleads_db` the FA system
// uses (studentrecords + pcm_* tables). Most pcm_* tables live in the `crm`
// Postgres schema; the connection's search_path spans crm + public, so v1's
// unqualified SQL resolves — with ONE exception ported verbatim: any read of
// `finance_renewals` MUST be `public.`-qualified (a stale `crm` copy exists).
//
// Env precedence mirrors v1: FA_DATABASE_URL → LEADS_DB_URL → DATABASE_URL.

declare global {
  // eslint-disable-next-line no-var
  var __pcmPgPool: Pool | undefined;
}

function makePool(): Pool {
  const url =
    process.env.FA_DATABASE_URL ||
    process.env.LEADS_DB_URL ||
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "PCM database connection string is not set. Define one of " +
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

export const pool: Pool = globalThis.__pcmPgPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__pcmPgPool = pool;
