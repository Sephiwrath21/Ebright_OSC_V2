/**
 * Apply a file from prisma/manual-sql/ to DATABASE_URL, in a transaction.
 *
 * The project is schema-first with no prisma/migrations folder, and `prisma db
 * push` trips over pre-existing drift, so additive DDL is applied by hand and
 * kept in prisma/manual-sql/ as the record. This runs one of those files.
 *
 *   node --env-file=.env scripts/apply-manual-sql.mjs prisma/manual-sql/<file>.sql
 *
 * The files are written to be idempotent, so re-running is safe.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node --env-file=.env scripts/apply-manual-sql.mjs <path-to.sql>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (pass --env-file=.env).");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`Applied: ${file}`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error(`Failed — rolled back: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
