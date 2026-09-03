import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  const leadsClient = new Client({
    connectionString: process.env.LEADS_DB_URL
  });
  await leadsClient.connect();

  // Check hr_staff_movements for offboarding (Didi)
  console.log("--- LEADS DB: hr_staff_movements (all with end_date soon) ---");
  try {
    const res = await leadsClient.query(`
      SELECT id, name, position, department_branch, start_date, end_date
      FROM hr_staff_movements
      WHERE end_date IS NOT NULL
      ORDER BY end_date DESC
      LIMIT 20
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  // Check hr_annual_leave and hr_mc tables
  console.log("\n--- LEADS DB: hr_annual_leave (structure) ---");
  try {
    const res = await leadsClient.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'hr_annual_leave' ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  console.log("\n--- LEADS DB: hr_mc (structure) ---");
  try {
    const res = await leadsClient.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'hr_mc' ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  console.log("\n--- LEADS DB: leave_transaction_with_names (structure) ---");
  try {
    const res = await leadsClient.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'leave_transaction_with_names' ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  await leadsClient.end();
}

run().catch(console.error);
