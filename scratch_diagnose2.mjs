import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  const client = new Client({
    connectionString: process.env.HRFS_DATABASE_URL
  });
  await client.connect();

  // Check Didi's record
  console.log("--- DIDI USER RECORD ---");
  const didi = await client.query(`
    SELECT u.user_id, u.email, u.status, u.deleted_at, up.full_name, 
           e.status AS emp_status, e.end_date, e.position, b.branch_code
    FROM users u
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    LEFT JOIN employment e ON e.user_id = u.user_id
    LEFT JOIN branch b ON b.branch_id = e.branch_id
    WHERE LOWER(up.full_name) LIKE '%didi%'
  `);
  console.log(JSON.stringify(didi.rows, null, 2));

  // Check today's leave requests 
  const todayMyt = new Date();
  console.log("\n--- LEAVE REQUESTS COVERING TODAY ---");
  const leaveRes = await client.query(`
    SELECT lr.leave_id, lr.user_id, up.full_name, 
           lr.start_date, lr.end_date, lr.status, lt.leave_type_code,
           u.status as user_status, u.deleted_at
    FROM leave_request lr
    JOIN leave_types lt ON lt.leave_type_id = lr.leave_type_id
    JOIN users u ON u.user_id = lr.user_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    WHERE lr.start_date <= (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      AND lr.end_date >= (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    ORDER BY lt.leave_type_code, up.full_name
  `);
  console.log(JSON.stringify(leaveRes.rows, null, 2));

  // Check attendance today  
  console.log("\n--- ATTENDANCE TODAY ---");
  const attRes = await client.query(`
    SELECT a.user_id, up.full_name, a.check_in AT TIME ZONE 'Asia/Kuala_Lumpur' as check_in_myt, 
           a.check_out AT TIME ZONE 'Asia/Kuala_Lumpur' as check_out_myt, a.status, a.date
    FROM attendance a
    JOIN users u ON u.user_id = a.user_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    WHERE a.date = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    ORDER BY a.check_in
  `);
  console.log(JSON.stringify(attRes.rows, null, 2));

  // Count active HQ staff  
  console.log("\n--- ACTIVE HQ STAFF COUNT ---");
  const countRes = await client.query(`
    SELECT COUNT(*) AS cnt
    FROM users u
    JOIN employment e ON e.user_id = u.user_id AND e.status = 'active'
    LEFT JOIN branch b ON b.branch_id = e.branch_id
    WHERE u.status = 'active' AND u.deleted_at IS NULL
      AND (b.branch_code = 'HQ' OR b.branch_name ILIKE 'HQ' OR b.location ILIKE 'HQ' OR e.branch_id IS NULL)
      AND (e.start_date IS NULL OR e.start_date <= (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
      AND (e.end_date IS NULL OR e.end_date >= (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
  `);
  console.log(JSON.stringify(countRes.rows, null, 2));

  // Users with NULL branch (no branch assigned) - these inflate the count
  console.log("\n--- USERS WITH NO BRANCH ---");
  const noBranch = await client.query(`
    SELECT COALESCE(up.full_name, u.email) AS name, e.position, e.status AS emp_status, b.branch_code
    FROM users u
    JOIN employment e ON e.user_id = u.user_id AND e.status = 'active'
    LEFT JOIN branch b ON b.branch_id = e.branch_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    WHERE u.status = 'active' AND u.deleted_at IS NULL
      AND e.branch_id IS NULL
      AND (e.start_date IS NULL OR e.start_date <= (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
      AND (e.end_date IS NULL OR e.end_date >= (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
    ORDER BY name
  `);
  console.log(JSON.stringify(noBranch.rows, null, 2));

  await client.end();
}

run().catch(console.error);
