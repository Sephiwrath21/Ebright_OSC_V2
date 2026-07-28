import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pkg;

async function run() {
  const client = new Client({
    connectionString: process.env.HRFS_DATABASE_URL
  });
  await client.connect();

  console.log("--- OFFBOARDING CASES IN hrfs ---");
  const res = await client.query(`
    SELECT oc.*, u.email, up.full_name
    FROM offboarding_case oc
    JOIN users u ON u.user_id = oc.user_id
    LEFT JOIN user_profile up ON up.user_id = u.user_id
  `);
  console.log(res.rows);

  await client.end();
}

run().catch(console.error);
