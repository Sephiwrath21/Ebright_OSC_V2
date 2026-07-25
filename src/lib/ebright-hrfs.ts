import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { prisma } from "./prisma";

type PoolCacheEntry = { signature: string; pool: Pool };
const globalForPool = globalThis as unknown as {
  __ebright_hrfs_pool?: PoolCacheEntry;
};

// Operational HR DB (BranchStaff, AttendanceLog) lives in the `ebright_hrfs`
// database — a DIFFERENT database from the prisma `hrfs` auth DB. It has its
// own env var so the two never get conflated. Falls back to HRFS_DATABASE_URL
// only for back-compat.
function operationalUrl(): string | undefined {
  return process.env.EBRIGHT_HRFS_URL ?? process.env.HRFS_DATABASE_URL;
}

function configSignature(): string {
  return operationalUrl() ?? "";
}

function makePool(): Pool {
  const connectionString = operationalUrl();
  if (!connectionString) {
    throw new Error(
      "EBRIGHT_HRFS_URL env var missing. Restart dev server after editing .env.",
    );
  }
  return new Pool({
    connectionString,
    // HR Dashboard fires ~12 parallel queries (6 cards × 1-3 queries each),
    // and the Summary/Report make 3-5 more — bumped from 5 to 20 so they
    // don't queue past the connect timeout.
    max: 20,
    idleTimeoutMillis: 30000,
    // Bumped from 5s — the MedicalLeave LEFT JOIN subquery is heavier than
    // a plain leave fetch and was hitting the 5s pool-wait window on the
    // 5th+ concurrent query.
    connectionTimeoutMillis: 15000,
  });
}

function getPool(): Pool {
  const signature = configSignature();
  const cached = globalForPool.__ebright_hrfs_pool;
  if (cached && cached.signature === signature) {
    return cached.pool;
  }
  if (cached) {
    cached.pool.end().catch(() => { });
  }
  const pool = makePool();
  if (process.env.NODE_ENV !== "production") {
    globalForPool.__ebright_hrfs_pool = { signature, pool };
  }
  return pool;
}

export async function queryEbrightHrfs<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return (await getPool().query(sql, params as never)) as QueryResult<T>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ebright_hrfs] Query error:", msg);
    throw new Error(`Failed to query ebright_hrfs: ${msg}`);
  }
}

// ── HQ attendance today ──────────────────────────────────────────────────────
export interface HqAttendance {
  present: number; // HQ staff who clocked in today
  absent: number; // active HQ staff with no attendance today
  annualLeave: number; // people on AL today
  mc: number; // people on any non-AL leave today
  presentNames: string[];
  absentNames: string[];
  annualLeaveNames: string[];
  mcNames: string[];
}

/**
 * Today's HQ attendance snapshot (Malaysia time), with the names behind each count:
 *  - Present     = active HQ FT/Intern staff with a check-in or HQ device scan today
 *  - Absent      = active HQ FT/Intern staff expected today (Mon–Fri), not present,
 *                  and not on approved leave
 *  - Annual Leave = active HQ FT/Intern staff with an approved 'AL' leave today
 *  - MC          = active HQ FT/Intern staff with an approved non-'AL' leave today
 *
 * Rules:
 *  - Only active HQ staff from BranchStaff are counted; inactive, future-dated,
 *    and offboarding employees are excluded.
 *  - Leave is filtered to ApplyStatus = 'A' (approved) only.
 *  - Leave list is cross-referenced against active HQ users by name so that
 *    offboarding employees (e.g. someone in payroll leave but not in active roster)
 *    do not appear in the counts.
 */
export async function getHqAttendanceToday(): Promise<HqAttendance> {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const dayName = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  const expectedToday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(dayName);

  const offboardingEmployeeCodes = new Set(
    (
      await prisma.employment.findMany({
        where: {
          user_id: {
            in: (
              await prisma.offboarding_case.findMany({
                where: { status: { not: "Completed" } },
                select: { user_id: true },
              })
            ).map((row) => row.user_id),
          },
        },
        select: { employee_id: true },
      })
    )
      .map((row) => row.employee_id?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code)),
  );

  const staff = await queryEbrightHrfs<{
    name: string | null;
    employeeId: string | null;
    start_date: string | null;
    endDate: string | null;
    employment_type: string | null;
    position: string | null;
    status: string | null;
    branch: string | null;
  }>(`
    SELECT
      NULLIF(btrim("name"), '') AS name,
      NULLIF(btrim("employeeId"), '') AS "employeeId",
      NULLIF(btrim("start_date"), '') AS start_date,
      NULLIF(btrim("endDate"), '') AS "endDate",
      NULLIF(btrim("employment_type"), '') AS employment_type,
      NULLIF(btrim("position"), '') AS position,
      NULLIF(btrim("status"), '') AS status,
      NULLIF(btrim("branch"), '') AS branch
    FROM public."BranchStaff"
    WHERE lower("branch") = 'hq'
      AND upper(trim("status")) = 'ACTIVE'
    ORDER BY "name"
  `);

  const normalizeToken = (value: string | null | undefined) =>
    (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const isNameMatch = (
    staffName: string | null | undefined,
    attendanceName: string | null | undefined,
  ) => {
    const staffToken = normalizeToken(staffName);
    const attendanceToken = normalizeToken(attendanceName);
    if (!staffToken || !attendanceToken) {
      return false;
    }
    return (
      staffToken === attendanceToken ||
      staffToken.includes(attendanceToken) ||
      attendanceToken.includes(staffToken)
    );
  };

  const activeStaff = staff.rows.filter((row) => {
    const employeeCode = row.employeeId?.trim().toUpperCase();
    if (employeeCode && offboardingEmployeeCodes.has(employeeCode)) {
      return false;
    }

    const status = (row.status ?? "").toUpperCase();
    if (status !== "ACTIVE") {
      return false;
    }

    const start = row.start_date?.trim();
    const end = row.endDate?.trim();
    if (start && start > localDate) {
      return false;
    }
    if (end && end < localDate) {
      return false;
    }
    return true;
  });

  const attendance = await queryEbrightHrfs<{
    emp_no: string | null;
    emp_name: string | null;
  }>(`
    SELECT DISTINCT
      NULLIF(btrim("empNo"), '') AS emp_no,
      NULLIF(btrim("empName"), '') AS emp_name
    FROM public."AttendanceLog"
    WHERE "date" = $1
  `, [localDate]);

  const presentEmployeeCodes = new Set(
    attendance.rows
      .map((row) => row.emp_no?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code)),
  );

  const presentNames = activeStaff
    .filter((row) => {
      const employeeCode = row.employeeId?.trim().toUpperCase();
      const hasCodeMatch = Boolean(employeeCode && presentEmployeeCodes.has(employeeCode));
      const hasNameMatch = attendance.rows.some((attendanceRow) =>
        isNameMatch(row.name, attendanceRow.emp_name),
      );
      return hasCodeMatch || hasNameMatch;
    })
    .map((row) => row.name ?? "");

  const presentNameSet = new Set(
    presentNames.map((name) => name.trim().toUpperCase()).filter(Boolean),
  );

  const activeHqNames = new Set(activeStaff.map((row) => row.name?.trim().toUpperCase() ?? ""));
  const activeHqEmployeeCodes = new Set(
    activeStaff
      .map((row) => row.employeeId?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code)),
  );

  // Leave data comes from the HRMS operational DB (LeaveTransaction), not the
  // leads DB. Only approved entries are shown, and we restrict them to the
  // active HQ roster so offboarding and ex-staff do not appear on the report.
  const leave = await queryEbrightHrfs<{
    who: string | null;
    employee_code: string | null;
    leave_type_code: string | null;
  }>(`
    SELECT DISTINCT
      COALESCE(NULLIF(btrim("EmployeeName"), ''), "EmployeeCode") AS who,
      NULLIF(btrim(upper("EmployeeCode")), '') AS employee_code,
      NULLIF(btrim(upper("LeaveTypeCode")), '') AS leave_type_code
    FROM public."LeaveTransaction"
    WHERE "LeaveDate" = $1
      AND upper(btrim("ApplyStatus")) = 'A'
    ORDER BY who
  `, [localDate]);

  const approvedLeave = leave.rows.filter((row) => {
    const employeeCode = row.employee_code?.trim().toUpperCase();
    const name = row.who?.trim().toUpperCase();
    return (
      (employeeCode ? activeHqEmployeeCodes.has(employeeCode) : false) ||
      (name ? activeHqNames.has(name) : false)
    );
  });

  const onLeaveUpperSet = new Set(
    approvedLeave.map((row) => row.who?.trim().toUpperCase() ?? ""),
  );

  const annualLeaveNames = approvedLeave
    .filter((row) => (row.leave_type_code ?? "").toUpperCase() === "AL")
    .map((row) => row.who ?? "");
  const mcNames = approvedLeave
    .filter((row) => (row.leave_type_code ?? "").toUpperCase() !== "AL")
    .map((row) => row.who ?? "");

  // Absent = expected today + not present + not on approved leave
  const absentNames = activeStaff
    .filter((row) => {
      const name = row.name?.trim();
      if (!name) {
        return false;
      }
      if (!expectedToday) {
        return false;
      }
      const isPresent = presentNameSet.has(name.toUpperCase());
      const isOnLeave = onLeaveUpperSet.has(name.toUpperCase());
      return !isPresent && !isOnLeave;
    })
    .map((row) => row.name ?? "");

  return {
    present: presentNames.length,
    absent: absentNames.length,
    annualLeave: annualLeaveNames.length,
    mc: mcNames.length,
    presentNames,
    absentNames,
    annualLeaveNames,
    mcNames,
  };
}
