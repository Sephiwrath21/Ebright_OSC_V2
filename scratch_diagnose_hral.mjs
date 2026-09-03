import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  const leadsClient = new Client({
    connectionString: process.env.LEADS_DB_URL
  });
  await leadsClient.connect();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  console.log("Today:", todayStr);

  // Check hr_annual_leave for today
  console.log("\n--- LEADS DB: hr_annual_leave TODAY ---");
  try {
    const res = await leadsClient.query(`
      SELECT * FROM hr_annual_leave
      WHERE al_date = $1
      ORDER BY name
    `, [todayStr]);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  // Check hr_mc for today
  console.log("\n--- LEADS DB: hr_mc TODAY ---");
  try {
    const res = await leadsClient.query(`
      SELECT * FROM hr_mc
      WHERE mc_date = $1
      ORDER BY name
    `, [todayStr]);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  // Check hr_attendance_live for today
  console.log("\n--- LEADS DB: hr_attendance_live (structure) ---");
  try {
    const res = await leadsClient.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'hr_attendance_live' ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  console.log("\n--- LEADS DB: hr_attendance_live TODAY sample ---");
  try {
    const res = await leadsClient.query(`
      SELECT * FROM hr_attendance_live LIMIT 5
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch(e) {
    console.error("Error:", e.message);
  }

  await leadsClient.end();
}

run().catch(console.error);
