import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  const client = new Client({
    connectionString: process.env.HRFS_DATABASE_URL
  });
  await client.connect();

  console.log("--- LEAVE REQUESTS IN hrfs ---");
  const res = await client.query(`
    SELECT lr.*, lt.leave_type_code, lt.name as leave_type_name, up.full_name
    FROM leave_request lr
    JOIN leave_types lt ON lt.leave_type_id = lr.leave_type_id
    JOIN users u ON u.user_id = lr.user_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
    LIMIT 10
  `);
  console.log(res.rows);

  await client.end();
}

run().catch(console.error);
