import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const prisma = new PrismaClient();
const hrfs = new Client({ connectionString: process.env.EBRIGHT_HRFS_URL });

const normalizeToken = (value) => (value ?? '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');

async function main() {
    await prisma.$connect();
    await hrfs.connect();

    try {
        const offboarding = await prisma.offboarding_case.findMany({
            where: { status: { not: 'Completed' } },
            select: { user_id: true },
        });
        const offboardingIds = new Set(offboarding.map((row) => row.user_id));

        const localDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kuala_Lumpur',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date());

        const staffRows = await hrfs.query(`
      SELECT "name", "employeeId", "start_date", "endDate", "employment_type", "position", "status", "branch"
      FROM public."BranchStaff"
      WHERE lower("branch") = 'hq' AND upper(trim("status")) = 'ACTIVE'
      ORDER BY "name"
    `);

        const activeHqStaff = staffRows.rows.filter((row) => {
            const start = (row.start_date || '').toString().trim();
            const end = (row.endDate || '').toString().trim();
            const activeDate = !start || start <= localDate;
            const notEnded = !end || end >= localDate;
            return activeDate && notEnded;
        });

        const attendanceRows = await hrfs.query(
            'SELECT "empNo", "empName" FROM public."AttendanceLog" WHERE "date" = $1',
            [localDate],
        );

        const presentEmployeeCodes = new Set(
            attendanceRows.rows
                .map((row) => row.empNo?.trim().toUpperCase())
                .filter(Boolean),
        );
        const presentEmployeeNames = new Set(
            attendanceRows.rows
                .map((row) => normalizeToken(row.empName))
                .filter(Boolean),
        );

        const presentNames = [];
        for (const row of activeHqStaff) {
            const employeeCode = (row.employeeId || '').toString().trim().toUpperCase();
            const nameToken = normalizeToken(row.name);
            if (
                (employeeCode && presentEmployeeCodes.has(employeeCode)) ||
                (nameToken && presentEmployeeNames.has(nameToken))
            ) {
                presentNames.push(row.name);
            }
        }

        const leaveRows = await hrfs.query(
            'SELECT "EmployeeCode", "EmployeeName", "LeaveTypeCode" FROM public."LeaveTransaction" WHERE "LeaveDate" = $1 AND upper(btrim("ApplyStatus")) = $2',
            [localDate, 'A'],
        );

        const approvedLeave = leaveRows.rows.filter((row) => {
            const employeeCode = (row.EmployeeCode || '').toString().trim().toUpperCase();
            const name = (row.EmployeeName || '').toString().trim().toUpperCase();
            return activeHqStaff.some((staff) => {
                const staffCode = (staff.employeeId || '').toString().trim().toUpperCase();
                const staffName = (staff.name || '').toString().trim().toUpperCase();
                return staffCode === employeeCode || staffName === name;
            });
        });

        const annualLeaveNames = approvedLeave
            .filter((row) => (row.LeaveTypeCode || '').toString().toUpperCase() === 'AL')
            .map((row) => row.EmployeeName || row.EmployeeCode || '');
        const mcNames = approvedLeave
            .filter((row) => (row.LeaveTypeCode || '').toString().toUpperCase() !== 'AL')
            .map((row) => row.EmployeeName || row.EmployeeCode || '');

        const presentSet = new Set(presentNames.map((name) => name.toUpperCase()));
        const leaveSet = new Set(approvedLeave.map((row) => (row.EmployeeName || row.EmployeeCode || '').toString().trim().toUpperCase()));

        const absentNames = activeHqStaff
            .filter((row) => {
                const nameUpper = (row.name || '').toString().trim().toUpperCase();
                return !presentSet.has(nameUpper) && !leaveSet.has(nameUpper);
            })
            .map((row) => row.name);

        console.log(JSON.stringify({
            localDate,
            activeHqStaffCount: activeHqStaff.length,
            present: presentNames.length,
            absent: absentNames.length,
            annualLeave: annualLeaveNames.length,
            mc: mcNames.length,
            presentNames,
            absentNames,
            annualLeaveNames,
            mcNames,
        }, null, 2));
    } finally {
        await hrfs.end();
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
