require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const p = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

bcrypt.hash('doom2026', 10).then(h =>
  p.query('UPDATE doomtracker.users SET password=$1 WHERE email=$2', [h, 'admin@ebright.com'])
).then(() => {
  console.log('Password reset OK');
  process.exit(0);
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});