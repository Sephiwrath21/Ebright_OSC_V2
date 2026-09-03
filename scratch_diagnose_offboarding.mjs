import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  // Check leads DB for offboarding staff info
  const leadsClient = new Client({
    connectionString: process.env.LEADS_DB_URL
  });
  await leadsClient.connect();

  console.log("--- LEADS DB: hr_staff_movements (offboarding) ---");
  try {
    const res = await leadsClient.query(`
      SELECT id, name, position, department_branch, start_date, end_date
      FROM hr_staff_movements
      WHERE end_date IS NOT NULL AND end_date > NOW() - INTERVAL '30 days'
      ORDER BY end_date ASC
      LIMIT 20
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error querying hr_staff_movements:", e.message);
  }

  // See all tables in leads DB
  console.log("\n--- LEADS DB: Available views/tables ---");
  try {
    const res = await leadsClient.query(`
      SELECT table_name, table_type FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  await leadsClient.end();
}

run().catch(console.error);
