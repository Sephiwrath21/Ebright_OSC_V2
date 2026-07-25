import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfsSource } from "@/lib/ebright-hrfs-source";
import AppShell from "@/app/components/AppShell";
import AttendanceReportView, {
  type EmployeeOption,
  type BranchOption,
  type DepartmentOption,
  type MonthOption,
  type DayRow,
  type EmployeeContext,
} from "@/app/components/AttendanceReportView";
import {
  scheduleForDate,
  type WeeklySchedule,
  type DayKey,
} from "@/lib/schedule-history";

export const dynamic = "force-dynamic";

// role_ids of real, badge-carrying staff shown in attendance: ceo(2),
// regional manager(5), staff(6), hod(7). Excludes generic/shared accounts —
// superadmin(1), department(3), branch(4).
const ATTENDANCE_ROLE_IDS = [2, 5, 6, 7];
// A plain staff member can only view their own report.
const STAFF_ROLE_ID = 6;


const WEEKEND_DAY_NUMBERS = new Set([0, 1]);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_KEYS: DayKey[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Company convention preserved from the legacy report — Sun/Mon are
// "weekend" days when no schedule covers them (kept as a fallback so people
// without scheduled hours don't see the whole week as "no_record").
const WEEKEND_FALLBACK_DAY_NUMBERS = new Set([0, 1]);

// TODO: confirm these match the intended business rule.
const LATE_GRACE_MINUTES = 15;
const CHECKOUT_EARLIEST_MYT = "14:00:00";

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// "YYYY-MM-DD" in MYT for a UTC timestamp. en-CA gives ISO-style output and
// the timeZone option keeps the calendar day from drifting around midnight.
function mytIsoDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function mytHm(d: Date): string {
  return TIME_FMT.format(d);
}

function classifyLate(hm: string, scheduledStart: string, graceMin: number): boolean {
  const ms = /^(\d{2}):(\d{2})/.exec(scheduledStart);
  const mc = /^(\d{2}):(\d{2})/.exec(hm);
  if (!ms || !mc) return false;
  const start = Number(ms[1]) * 60 + Number(ms[2]);
  const clock = Number(mc[1]) * 60 + Number(mc[2]);
  return clock > start + graceMin;
}

function classifyEarly(hm: string, scheduledEnd: string): boolean {
  const me = /^(\d{2}):(\d{2})/.exec(scheduledEnd);
  const mc = /^(\d{2}):(\d{2})/.exec(hm);
  if (!me || !mc) return false;
  const end = Number(me[1]) * 60 + Number(me[2]);
  const clock = Number(mc[1]) * 60 + Number(mc[2]);
  return clock < end;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

interface PageProps {
  searchParams: Promise<{
    employeeId?: string;
    month?: string;
    branch?: string;
    dept?: string;
    date?: string;
  }>;
}

export default async function AttendanceReportPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const sp = await searchParams;

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { user_id: true, role_id: true },
  });
  if (!me) redirect("/login");

  const restrictToSelf = me.role_id === STAFF_ROLE_ID;

  // Pull local branches (static lookup — used for the Branch dropdown labels).
  const branches = await prisma.branch.findMany({
    where: { branch_code: { not: null } },
    select: { branch_code: true, branch_name: true },
    orderBy: { branch_name: "asc" },
  });

  // ── PORTAL roster (users + employment), keyed by user_id. This replaces the
  //    external HRFS BranchStaff list: the staff picker, branch/department
  //    filters, schedule and sidebar all come from portal records. Attendance
  //    scans link by employment.employee_id — the same value stored as the
  //    biometric enrollment number in hikvision_attendance_all.person_id.
  interface StaffRow {
    userId: number;
    employmentId: number;
    employeeId: string | null;
    name: string | null;
    branchCode: string | null;
    branchName: string | null;
    department: string | null;
    position: string | null;
    workingHours: WeeklySchedule | null;
    versions: { effectiveFrom: string; schedule: WeeklySchedule }[];
  }

  const employments = await prisma.employment.findMany({
    // Only real staff roles appear in attendance: staff(6), regional manager(5),
    // hod(7), ceo(2). Excludes generic/shared logins — superadmin(1),
    // department(3), branch(4) — which have no badge and aren't people.
    where: {
      status: "active",
      users: { status: "active", role_id: { in: ATTENDANCE_ROLE_IDS } },
    },
    select: {
      employment_id: true,
      user_id: true,
      employee_id: true,
      position: true,
      working_hours_json: true,
      branch: { select: { branch_code: true, branch_name: true } },
      department: { select: { department_name: true } },
      users: { select: { user_profile: { select: { full_name: true, nick_name: true } } } },
      schedule_versions: {
        select: { effective_from: true, schedule: true },
        orderBy: { effective_from: "asc" },
      },
    },
    orderBy: { employment_id: "asc" },
  });

  // One active employment per user (defensive: keep the first seen).
  const staffByUser = new Map<number, StaffRow>();
  for (const e of employments) {
    if (staffByUser.has(e.user_id)) continue;
    staffByUser.set(e.user_id, {
      userId: e.user_id,
      employmentId: e.employment_id,
      employeeId: e.employee_id,
      name: e.users.user_profile?.full_name ?? e.users.user_profile?.nick_name ?? null,
      branchCode: e.branch?.branch_code ?? null,
      branchName: e.branch?.branch_name ?? null,
      department: e.department?.department_name ?? null,
      position: e.position ?? null,
      workingHours: (e.working_hours_json as WeeklySchedule | null) ?? null,
      versions: e.schedule_versions.map((v) => ({
        effectiveFrom: v.effective_from.toISOString().slice(0, 10),
        schedule: v.schedule as WeeklySchedule,
      })),
    });
  }
  const allStaff = [...staffByUser.values()].sort((a, b) =>
    (a.name ?? `#${a.userId}`).localeCompare(b.name ?? `#${b.userId}`),
  );
  const myStaff = allStaff.find((s) => s.userId === me.user_id) ?? null;

  // Departments dropdown: only relevant when Branch=HQ. Derive from the actual
  // department values on HQ staff so the dropdown reflects real data.
  const hqDepts = new Set<string>();
  for (const s of allStaff) {
    if (s.branchCode === "HQ" && s.department) hqDepts.add(s.department);
  }
  const departments = [...hqDepts].sort().map((d) => ({ department_code: d, department_name: d }));

  const branchFilter = restrictToSelf ? "" : (sp.branch ?? "");

  const deptFilter =
    !restrictToSelf && branchFilter === "HQ" ? (sp.dept ?? "") : "";
  const staffForDropdown = restrictToSelf
    ? allStaff.filter((s) => s.userId === me.user_id)
    : allStaff.filter((s) => {
        if (branchFilter && s.branchCode !== branchFilter) return false;
        if (deptFilter && s.department !== deptFilter) return false;
        return true;
      });

  const employeeOptions: EmployeeOption[] = staffForDropdown.map((s) => ({
    userId: s.userId, // portal user_id (used as the picker value)
    name: s.name ?? `Staff #${s.userId}`,
    branchCode: s.branchCode,
  }));

  let selectedId: number | null;
  if (restrictToSelf) {
    selectedId = staffForDropdown[0]?.userId ?? null;
  } else {
    const requested = sp.employeeId ? Number(sp.employeeId) : NaN;
    if (Number.isFinite(requested) && staffForDropdown.some((s) => s.userId === requested)) {
      selectedId = requested;
    } else if (myStaff && staffForDropdown.some((s) => s.userId === myStaff.userId)) {
      selectedId = myStaff.userId;
    } else {
      selectedId = staffForDropdown[0]?.userId ?? null;
    }
  }
  const selected = selectedId !== null ? allStaff.find((s) => s.userId === selectedId) ?? null : null;
  const selectedEmployeeCode = selected?.employeeId ?? null;

  
  const nowMyt = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }),
  );
  const defaultMonth = `${nowMyt.getFullYear()}-${String(nowMyt.getMonth() + 1).padStart(2, "0")}`;


  let dateStr = "";
  if (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) {
    const probe = new Date(sp.date + "T00:00:00Z");
    if (!isNaN(probe.getTime()) && probe.toISOString().slice(0, 10) === sp.date) {
      dateStr = sp.date;
    }
  }

  const monthStr = dateStr
    ? dateStr.slice(0, 7)
    : /^\d{4}-\d{2}$/.test(sp.month ?? "")
      ? sp.month!
      : defaultMonth;
  const [year, month] = monthStr.split("-").map(Number);

  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDay = dateStr ? Number(dateStr.slice(8, 10)) : 1;
  const endDay   = dateStr ? Number(dateStr.slice(8, 10)) : lastDayOfMonth;

  // UTC bounds covering [startDay 00:00 MYT, endDay+1 00:00 MYT).
  // Midnight MYT = previous-day 16:00 UTC.
  const windowStart = new Date(Date.UTC(year, month - 1, startDay, -8, 0, 0));
  const windowEnd   = new Date(Date.UTC(year, month - 1, endDay + 1, -8, 0, 0));

  // Schedule history for the selected staff — sourced from the PORTAL
  // (employment.working_hours_json + employment_schedule_version), resolved on
  // the roster row above. No BranchStaff dependency.
  const cachedWorkingHours: WeeklySchedule | null = selected?.workingHours ?? null;
  const versions = selected?.versions ?? [];

  // ── HRFS: scans for this employee in the window ──────────────────────────
  // Aggregate per MYT date so a single day shows one row even when scans came
  // from multiple devices/scanners. Uses the same source/aggregation as the
  // Summary view so the two pages always agree on times.
  type ScanRow = {
    date_myt: string;
    first_event: Date;
    last_event: Date;
    scan_count: string;
  };
  const scansByDate = new Map<string, { firstEvent: Date; lastEvent: Date }>();
  if (selectedEmployeeCode) {
    const scanRes = await queryEbrightHrfsSource<ScanRow>(
      `WITH events AS (
         SELECT
           COALESCE(m.true_id, h.person_id) AS emp_no,
           h.event_time
         FROM public.hikvision_attendance_all h
         LEFT JOIN public.hikvision_id_map m ON m.wrong_id = h.person_id
         WHERE h.event_time >= $1
           AND h.event_time <  $2
           AND COALESCE(m.true_id, h.person_id) = $3
       )
       SELECT
         to_char(event_time AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD') AS date_myt,
         MIN(event_time) AS first_event,
         MAX(event_time) AS last_event,
         COUNT(*)::text AS scan_count
       FROM events
       GROUP BY date_myt
       ORDER BY date_myt`,
      [windowStart.toISOString(), windowEnd.toISOString(), selectedEmployeeCode],
    );
    for (const r of scanRes.rows) {
      const first = r.first_event instanceof Date ? r.first_event : new Date(r.first_event);
      const last  = r.last_event  instanceof Date ? r.last_event  : new Date(r.last_event);
      scansByDate.set(r.date_myt, { firstEvent: first, lastEvent: last });
    }
  }

  // ── HRFS: leave records for this employee in the window ──────────────────
  // LeaveDate is a DATE column on HRFS — to_char keeps the key as a plain
  // YYYY-MM-DD string so it matches the per-day isoDate lookup below without
  // any timezone re-parsing. LeaveTransaction has no LeaveTypeName column;
  // we surface just the code (UI renders it as a chip).
  const leaveByDate = new Map<string, { code: string | null; name: string | null }>();
  if (selectedEmployeeCode) {
    const lvRes = await queryEbrightHrfsSource<{
      leave_date: string;
      leave_type_code: string | null;
    }>(
      `SELECT to_char("LeaveDate", 'YYYY-MM-DD') AS leave_date,
              "LeaveTypeCode" AS leave_type_code
         FROM public."LeaveTransaction"
        WHERE "EmployeeCode" = $1
          AND "LeaveDate" >= $2::date AND "LeaveDate" <= $3::date`,
      [
        selectedEmployeeCode,
        `${year}-${String(month).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
        `${year}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
      ],
    );
    for (const r of lvRes.rows) {
      leaveByDate.set(r.leave_date, { code: r.leave_type_code, name: null });
    }
  }

  // ── Build per-day rows ───────────────────────────────────────────────────
  let presentCount = 0;
  let noRecordCount = 0;
  let onLeaveCount = 0;
  let lateCount = 0;
  let leftEarlyCount = 0;
  let totalSeconds = 0;

  const rows: DayRow[] = [];
  for (let d = startDay; d <= endDay; d++) {
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const probe = new Date(Date.UTC(year, month - 1, d));
    const dayOfWeek = probe.getUTCDay();
    const dayKey = DAY_KEYS[dayOfWeek];

    // Schedule resolution:
    //   - versions present and one covers this date → use it
    //   - versions present but none covers this date → no schedule (no badges)
    //   - no versions at all → fall back to cached current workingHours
    let scheduleForDay: WeeklySchedule | undefined;
    if (versions.length > 0) {
      scheduleForDay = scheduleForDate(versions, isoDate);
    } else if (cachedWorkingHours) {
      scheduleForDay = cachedWorkingHours;
    }
    const todaysSlot = scheduleForDay?.[dayKey] ?? null;

    const scan = scansByDate.get(isoDate) ?? null;
    const sameEvent =
      scan && scan.firstEvent.getTime() === scan.lastEvent.getTime();
    const checkInDate = scan?.firstEvent ?? null;
    // Check-out only counts when:
    //   1. it's strictly later than first scan (not a single-scan day), AND
    //   2. it's at or after the 14:00 MYT cutoff (earlier "second scans"
    //      are duplicates / quick step-outs, not real check-outs).
    const checkOutDate =
      scan && !sameEvent && mytHm(scan.lastEvent) >= CHECKOUT_EARLIEST_MYT
        ? scan.lastEvent
        : null;

    const leave = leaveByDate.get(isoDate) ?? null;

    let status: DayRow["status"];
    let duration: string | null = null;
    let late = false;
    let leftEarly = false;
    let leaveCode: string | null = null;

    if (leave) {
      // Leave outranks scans for status — even if they popped by, the day is
      // accounted as leave for the report.
      status = "leave";
      leaveCode = leave.code;
      onLeaveCount += 1;
    } else if (checkInDate && checkOutDate) {
      // Feature 2: Present only when BOTH scans exist — keeps "Days Present"
      // and "Total Hours" consistent (a single-scan day has neither).
      status = "present";
      const diff = (checkOutDate.getTime() - checkInDate.getTime()) / 1000;
      if (diff > 0) {
        duration = formatDuration(diff);
        totalSeconds += diff;
      }
      if (todaysSlot) {
        late = classifyLate(mytHm(checkInDate), todaysSlot.start, LATE_GRACE_MINUTES);
        leftEarly = classifyEarly(mytHm(checkOutDate), todaysSlot.end);
      }
      if (late) lateCount += 1;
      if (leftEarly) leftEarlyCount += 1;
      presentCount += 1;
    } else if (!todaysSlot && WEEKEND_FALLBACK_DAY_NUMBERS.has(dayOfWeek)) {
      // No schedule for an off-day → render as weekend (cosmetic; doesn't
      // count toward present/no_record).
      status = "weekend";
    } else {
      status = "no_record";
      noRecordCount += 1;
    }

    rows.push({
      day: d,
      dayName: DAY_LABELS[dayOfWeek],
      date: `${String(d).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
      isoDate,
      checkIn: checkInDate ? mytHm(checkInDate) : null,
      checkOut: checkOutDate ? mytHm(checkOutDate) : null,
      duration,
      status,
      late,
      leftEarly,
      leaveCode,
    });
  }

  const branchOptions: BranchOption[] = branches.map((b) => ({
    code: b.branch_code!,
    name: b.branch_name,
  }));

  const departmentOptions: DepartmentOption[] = departments.map((d) => ({
    code: d.department_code,
    name: d.department_name,
  }));

  const monthOptions: MonthOption[] = [];
  const baseYear = nowMyt.getFullYear();
  for (let yr = baseYear; yr >= baseYear - 1; yr--) {
    for (let mo = 12; mo >= 1; mo--) {
      const value = `${yr}-${String(mo).padStart(2, "0")}`;
      const label = new Date(yr, mo - 1, 1).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      monthOptions.push({ value, label });
    }
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  const dateLabel = dateStr
    ? new Date(dateStr + "T00:00:00Z").toLocaleString("en-US", {
        weekday: "short",
        day:     "numeric",
        month:   "short",
        year:    "numeric",
        timeZone: "UTC",
      })
    : null;

  // Sidebar metadata now comes from the portal employment/user record.
  const employeeContext: EmployeeContext | null = selected
    ? {
        userId: selected.userId,
        name: selected.name,
        position: selected.position,
        department: selected.department,
        role: null,
        location: selected.branchName,
        branchCode: selected.branchCode,
        // No BranchStaff link — schedule editor deep-link is disabled.
        branchStaffId: null,
        employeeCode: selectedEmployeeCode,
      }
    : null;

  const totalHoursLabel =
    totalSeconds > 0 ? formatDuration(totalSeconds) : null;

  const userEmail = session.user?.email ?? "";
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "";
  const userName = session.user?.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <AttendanceReportView
        branches={branchOptions}
        departments={departmentOptions}
        employees={employeeOptions}
        months={monthOptions}
        rows={rows}
        employee={employeeContext}
        selectedBranch={branchFilter}
        selectedDept={deptFilter}
        selectedEmployeeId={selected?.userId ?? null}
        selectedMonth={monthStr}
        monthLabel={monthLabel}
        selectedDate={dateStr}
        dateLabel={dateLabel}
        restrictToSelf={restrictToSelf}
        summary={{
          present: presentCount,
          noRecord: noRecordCount,
          onLeave: onLeaveCount,
          late: lateCount,
          leftEarly: leftEarlyCount,
          totalHours: totalHoursLabel,
          totalSeconds,
        }}
      />
    </AppShell>
  );
}
