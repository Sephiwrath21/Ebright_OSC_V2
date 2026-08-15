const { Client } = require('./node_modules/pg');

async function main() {
  const PG_PASSWORD = process.env.PG_PASSWORD;
  if (!PG_PASSWORD) throw new Error('PG_PASSWORD is required — run: set -a; . /home/staff1/.pg_env; set +a');

  const client = new Client({
    connectionString: `postgresql://optidept:${PG_PASSWORD}@103.209.156.174:5433/hrfs?schema=public`
  });
  await client.connect();
  const res = await client.query("SELECT claim_id, claim_type, claim_description FROM claim ORDER BY claim_id DESC LIMIT 5;");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
