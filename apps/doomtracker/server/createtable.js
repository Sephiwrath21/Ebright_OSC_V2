require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const p = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

p.query(`
  CREATE TABLE IF NOT EXISTS doomtracker.flowcharts (
    id TEXT PRIMARY KEY,
    department TEXT NOT NULL,
    name TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`)
  .then(() => console.log('flowcharts table created OK'))
  .catch(e => console.error(e.message))
  .finally(() => process.exit());