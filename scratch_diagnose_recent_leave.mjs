import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  const leadsClient = new Client({
    connectionString: process.env.LEADS_DB_URL
  });
  await leadsClient.connect();

  // Check recent hr_annual_leave
  console.log("--- LEADS DB: hr_annual_leave (last 5 days) ---");
  try {
    const res = await leadsClient.query(`
      SELECT * FROM hr_annual_leave
      WHERE al_date >= CURRENT_DATE - INTERVAL '5 days'
      ORDER BY al_date DESC, name
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  // Check recent hr_mc
  console.log("\n--- LEADS DB: hr_mc (last 5 days) ---");
  try {
    const res = await leadsClient.query(`
      SELECT * FROM hr_mc
      WHERE mc_date >= CURRENT_DATE - INTERVAL '5 days'
      ORDER BY mc_date DESC, name
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  // Check leave_transaction_with_names for last 5 days
  console.log("\n--- LEADS DB: leave_transaction_with_names (last 5 days) ---");
  try {
    const res = await leadsClient.query(`
      SELECT DISTINCT
        COALESCE(NULLIF(btrim("EmployeeName"), ''), "EmployeeCode") AS who,
        "LeaveTypeCode",
        "LeaveDate",
        "ApplyStatus"
      FROM leave_transaction_with_names
      WHERE "LeaveDate" >= CURRENT_DATE - INTERVAL '5 days'
      ORDER BY "LeaveDate" DESC, who
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  await leadsClient.end();
}

run().catch(console.error);
