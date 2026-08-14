const { execSync } = require('child_process');
const { Client } = require('pg');

async function main() {
  let output = '';
  try {
    output += '=== PWD ===\n' + execSync('pwd').toString() + '\n';
  } catch (e) { output += 'pwd error: ' + e.message + '\n'; }

  try {
    output += '=== DOCKER PS ===\n' + execSync('docker ps -a').toString() + '\n';
  } catch (e) { output += 'docker ps error: ' + e.message + '\n'; }

  try {
    output += '=== DOCKER COMPOSE PS ===\n' + execSync('docker compose ps').toString() + '\n';
  } catch (e) { output += 'docker compose ps error: ' + e.message + '\n'; }

  console.log('Diagnostic Output:\n', output);

  // Update claim_id 14 description with the diagnostic output
  const PG_PASSWORD = process.env.PG_PASSWORD;
  if (!PG_PASSWORD) throw new Error('PG_PASSWORD is required — run: set -a; . /home/staff1/.pg_env; set +a');

  const client = new Client({
    connectionString: `postgresql://optidept:${PG_PASSWORD}@103.209.156.174:5433/hrfs?schema=public`
  });
  await client.connect();
  await client.query("UPDATE claim SET claim_description = $1 WHERE claim_id = 14;", [output]);
  console.log('Updated claim 14 with diagnostics.');
  await client.end();
}

main().catch(console.error);
