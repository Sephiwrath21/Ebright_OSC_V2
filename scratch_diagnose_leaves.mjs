import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  // Check leads DB for leave data  
  const leadsClient = new Client({
    connectionString: process.env.LEADS_DB_URL
  });
  await leadsClient.connect();

  console.log("--- LEADS DB: leave_transaction_with_names for today ---");
  try {
    const res = await leadsClient.query(`
      SELECT DISTINCT
        COALESCE(NULLIF(btrim("EmployeeName"), ''), "EmployeeCode") AS who,
        "LeaveTypeCode",
        "LeaveDate",
        (upper(btrim("LeaveTypeCode")) = 'AL') AS is_al
      FROM leave_transaction_with_names
      WHERE "LeaveDate" = (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      ORDER BY who
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error querying leads DB:", e.message);
  }

  await leadsClient.end();
}

run().catch(console.error);
