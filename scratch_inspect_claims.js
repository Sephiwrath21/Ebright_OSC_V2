const { Client } = require('./node_modules/pg');

async function main() {
  const client = new Client({
    connectionString: "postgresql://optidept:ebrightoptidept2025@103.209.156.174:5433/hrfs?schema=public"
  });
  await client.connect();
  const res = await client.query("SELECT claim_id, claim_type, claim_description FROM claim ORDER BY claim_id DESC LIMIT 5;");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
