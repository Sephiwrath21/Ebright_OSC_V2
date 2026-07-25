import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const client = new Client({ connectionString: process.env.EBRIGHT_HRFS_URL });
await client.connect();
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const staffRes = await client.query(`
  SELECT "name", "employeeId", "start_date", "endDate", "employment_type", "position", "status", "branch"
  FROM public."BranchStaff"
  WHERE lower("branch") = 'hq'
  ORDER BY "name"
`);

const rows = staffRes.rows.filter((row) => {
    const status = (row.status || '').toString().toUpperCase();
    const start = (row.start_date || '').toString().trim();
    const end = (row.endDate || '').toString().trim();
    return status === 'ACTIVE' && (!start || start <= localDate) && (!end || end >= localDate);
});

console.log('active_hq_rows', rows.length);
console.log(rows.map((r) => ({ name: r.name, employeeId: r.employeeId, employment_type: r.employment_type, position: r.position, status: r.status })).slice(0, 80));

const attendanceRes = await client.query('SELECT DISTINCT "empNo", "empName" FROM public."AttendanceLog" WHERE "date"=$1', [localDate]);
console.log('attendance_rows', attendanceRes.rows.length);
console.log(attendanceRes.rows.slice(0, 80));

await client.end();
