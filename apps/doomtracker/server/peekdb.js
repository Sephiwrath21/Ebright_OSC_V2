require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const p = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

p.query("SELECT column_name FROM information_schema.columns WHERE table_schema='doomtracker' AND table_name='alerts_sent'")
  .then(r => console.log(r.rows))
  .catch(e => console.error(e.message))
  .finally(() => process.exit());