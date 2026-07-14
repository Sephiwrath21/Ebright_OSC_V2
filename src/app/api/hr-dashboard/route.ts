import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { queryLeadsDb, isLeadsAvailable } from "@/lib/leads-db";
import { remapStScan, ST_DEVICE_ID } from "@/lib/scan-identity";

export const dynamic = "force-dynamic";

// Management roles per spec.
const ALLOWED_ROLES = new Set([
  "superadmin", "super_admin", "admin", "hr", "hod", "ceo",
]);

// ── Date helpers (MYT calendar) ────────────────────────────────────────────
function todayMyt(): string {
  const m = new Date(Date.now() + 8 * 60 * 60_000);
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}-${String(m.getUTCDate()).padStart(2, "0")}`;
}
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function isoYyyyMm(date: string): { year: number; month: number; firstDay: string; lastDay: string } {
  const [y, m] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    year: y,
    month: m,
    firstDay: `${y}-${String(m).padStart(2, "0")}-01`,
    lastDay: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  };
}
function dayKeyOf(iso: string): "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" {
  const [y, m, d] = iso.split("-").map(Number);
  return (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[
    new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  ];
}

interface BasicListItem {
  empNo: string | null;
  name: string;
  branch: string | null;
  role: string | null;
  /** Extra context: leave code, scheduled start time, MIA reason, etc. */
  detail?: string | null;
  /** A date relevant to the card (start_date, endDate, LeaveDate). */
  date?: string | null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  if (!ALLOWED_ROLES.has(roleType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Month: default to current MYT month.
  const today = todayMyt();
  const monthParam = new URL(req.url).searchParams.get("month");
  const monthIso = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : today.slice(0, 8) + "01";
  const monthRange = isoYyyyMm(monthIso);

  // 1) Pull active BranchStaff once — used by every card for name/role/branch
  //    lookup and "missing today" base set. Includes workingHours so we can
  //    evaluate the day-of-week schedule for missing/flagged/MIA card logic.
  const bsRes = await queryEbrightHrfs<{
    id: number;
    name: string | null;
    branch: string | null;
    role: string | null;
    position: string | null;
    department: string | null;
    employee_id: string | null;
    start_date: string | null;
    end_date: string | null;
    signed_date: string | null;
    status: string | null;
    working_hours: Record<string, { start: string; end: string } | null> | null;
  }>(
    `SELECT id, name, branch, role, position, department,
            "employeeId" AS employee_id, start_date, "endDate" AS end_date,
            signed_date, status, "workingHours" AS working_hours
       FROM public."BranchStaff"`,
  );
  const allStaff = bsRes.rows;
  const activeStaff = allStaff.filter((s) => (s.status ?? "").toLowerCase() === "active");

  // empNo → staff details (for fast lookup in leave/justification joins).
  const staffByEmpNo = new Map<string, (typeof allStaff)[number]>();
  for (const s of allStaff) if (s.employee_id) staffByEmpNo.set(s.employee_id, s);
  // name (lowercased) → staff details (fallback for legacy leave rows without
  // EmployeeCode).
  const staffByName = new Map<string, (typeof allStaff)[number]>();
  for (const s of allStaff) if (s.name) staffByName.set(s.name.trim().toLowerCase(), s);

  // 1b) autocount_employee_map — only when LEADS_DB_URL is configured.
  // Maps autocount code → BranchStaff row, used to resolve PT staff that
  // appear in LeaveTransaction with codes like "EBPT216" not found anywhere
  // in BranchStaff or LeaveTransaction.EmployeeName.
  type AutocountRow = {
    autocount_code: string;
    branchstaff_name: string | null;
    branchstaff_role: string | null;
    branchstaff_branch: string | null;
    branchstaff_status: string | null;
  };
  const autocountByCode = new Map<string, AutocountRow>();
  if (isLeadsAvailable()) {
    try {
      const res = await queryLeadsDb<AutocountRow>(
        `SELECT m.autocount_code,
                bs.name AS branchstaff_name,
                bs.role AS branchstaff_role,
                bs.branch AS branchstaff_branch,
                bs.status AS branchstaff_status
           FROM public.autocount_employee_map m
           LEFT JOIN hrfs."BranchStaff" bs ON bs.id = m.branchstaff_id`,
      );
      if (res) for (const r of res.rows) autocountByCode.set(r.autocount_code, r);
    } catch (e) {
      console.warn("[hr-dashboard] autocount lookup failed:", (e as Error).message);
    }
  }

  // Name resolution: BranchStaff (by empNo) → LeaveTransaction EmployeeName
  // → autocount_employee_map → raw EmployeeCode.
  function resolveName(empCode: string | null, empName: string | null): {
    name: string;
    role: string | null;
    branch: string | null;
    status: string | null;
  } {
    if (empCode) {
      const bs = staffByEmpNo.get(empCode);
      if (bs?.name) {
        return {
          name: bs.name,
          role: bs.role,
          branch: bs.branch,
          status: bs.status,
        };
      }
    }
    if (empName) {
      const bs = staffByName.get(empName.trim().toLowerCase());
      if (bs?.name) {
        return {
          name: bs.name,
          role: bs.role,
          branch: bs.branch,
          status: bs.status,
        };
      }
    }
    if (empCode) {
      const ac = autocountByCode.get(empCode);
      if (ac?.branchstaff_name) {
        return {
          name: ac.branchstaff_name,
          role: ac.branchstaff_role,
          branch: ac.branchstaff_branch,
          status: ac.branchstaff_status,
        };
      }
    }
    if (empName) return { name: empName, role: null, branch: null, status: null };
    return { name: empCode ?? "(unknown)", role: null, branch: null, status: null };
  }

  // ── Card 1: Onboarding (start_date within [today-1mo, today+6mo]) ────────
  const onbWindowStart = addMonthsIso(today, -1);
  const onbWindowEnd = addMonthsIso(today, 6);
  const onboarding: BasicListItem[] = activeStaff
    .filter((s) => {
      const sd = s.start_date?.slice(0, 10);
      if (!sd || !/^\d{4}-\d{2}-\d{2}$/.test(sd)) return false;
      return sd >= onbWindowStart && sd <= onbWindowEnd;
    })
    .map((s) => ({
      empNo: s.employee_id,
      name: s.name ?? s.employee_id ?? `Staff #${s.id}`,
      branch: s.branch,
      role: s.role,
      date: s.start_date?.slice(0, 10) ?? null,
    }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  // ── Card 2: Offboarding (endDate within [today-1wk, today+2mo]) ──────────
  const offWindowStart = addDaysIso(today, -7);
  const offWindowEnd = addMonthsIso(today, 2);
  const offboarding: BasicListItem[] = activeStaff
    .filter((s) => {
      const ed = s.end_date?.slice(0, 10);
      if (!ed || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) return false;
      return ed >= offWindowStart && ed <= offWindowEnd;
    })
    .map((s) => ({
      empNo: s.employee_id,
      name: s.name ?? s.employee_id ?? `Staff #${s.id}`,
      branch: s.branch,
      role: s.role,
      date: s.end_date?.slice(0, 10) ?? null,
    }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  // ── Card 3: Annual Leave (approved AL, [today, today+14d]) ───────────────
  type LeaveRow = {
    employee_code: string | null;
    employee_name: string | null;
    leave_type_code: string | null;
    leave_date: string;
  };
  const alRes = await queryEbrightHrfs<LeaveRow>(
    `SELECT DISTINCT ON ("EmployeeCode", "LeaveDate", "LeaveTypeCode")
            "EmployeeCode" AS employee_code,
            "EmployeeName" AS employee_name,
            "LeaveTypeCode" AS leave_type_code,
            to_char("LeaveDate", 'YYYY-MM-DD') AS leave_date
       FROM public."LeaveTransaction"
      WHERE "ApplyStatus" = 'A'
        AND "LeaveTypeCode" = 'AL'
        AND "LeaveDate" >= $1::date AND "LeaveDate" <= $2::date`,
    [today, addDaysIso(today, 14)],
  );
  const annualLeave: BasicListItem[] = alRes.rows
    .map((r) => {
      const resolved = resolveName(r.employee_code, r.employee_name);
      return {
        empNo: r.employee_code,
        name: resolved.name,
        branch: resolved.branch,
        role: resolved.role,
        date: r.leave_date,
        detail: "AL",
        _status: resolved.status,
      };
    })
    .filter((r) => (r._status ?? "").toLowerCase() !== "inactive")
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map(({ _status: _, ...rest }) => rest);

  // ── Card 4: MC = all approved non-AL, [today-1mo, today], deduped ────────
  const mcRes = await queryEbrightHrfs<LeaveRow>(
    `SELECT DISTINCT ON ("EmployeeCode", "LeaveDate", "LeaveTypeCode")
            "EmployeeCode" AS employee_code,
            "EmployeeName" AS employee_name,
            "LeaveTypeCode" AS leave_type_code,
            to_char("LeaveDate", 'YYYY-MM-DD') AS leave_date
       FROM public."LeaveTransaction"
      WHERE "ApplyStatus" = 'A'
        AND "LeaveTypeCode" <> 'AL'
        AND "LeaveDate" >= $1::date AND "LeaveDate" <= $2::date`,
    [addMonthsIso(today, -1), today],
  );
  const mc: BasicListItem[] = mcRes.rows
    .map((r) => {
      const resolved = resolveName(r.employee_code, r.employee_name);
      return {
        empNo: r.employee_code,
        name: resolved.name,
        branch: resolved.branch,
        role: resolved.role,
        date: r.leave_date,
        detail: r.leave_type_code,
        _status: resolved.status,
      };
    })
    .filter((r) => (r._status ?? "").toLowerCase() !== "inactive")
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .map(({ _status: _, ...rest }) => rest);

  // ── Card 5: Flagged = > 2 SL this month per employee (minCount 3) ────────
  // "SL" is the medical leave code locally. We count any approved SL row in
  // the selected month and flag staff with 3 or more.
  const slRes = await queryEbrightHrfs<LeaveRow>(
    `SELECT "EmployeeCode" AS employee_code,
            "EmployeeName" AS employee_name,
            "LeaveTypeCode" AS leave_type_code,
            to_char("LeaveDate", 'YYYY-MM-DD') AS leave_date
       FROM public."LeaveTransaction"
      WHERE "ApplyStatus" = 'A'
        AND "LeaveTypeCode" = 'SL'
        AND "LeaveDate" >= $1::date AND "LeaveDate" <= $2::date`,
    [monthRange.firstDay, monthRange.lastDay],
  );
  const slPerEmp = new Map<string, { count: number; sample: LeaveRow }>();
  for (const r of slRes.rows) {
    const key = r.employee_code ?? r.employee_name ?? "";
    if (!key) continue;
    const e = slPerEmp.get(key);
    if (e) e.count += 1;
    else slPerEmp.set(key, { count: 1, sample: r });
  }
  const flagged: BasicListItem[] = [...slPerEmp.entries()]
    .filter(([, v]) => v.count >= 3)
    .map(([, v]) => {
      const resolved = resolveName(v.sample.employee_code, v.sample.employee_name);
      return {
        empNo: v.sample.employee_code,
        name: resolved.name,
        branch: resolved.branch,
        role: resolved.role,
        detail: `${v.count} SL this month`,
        _status: resolved.status,
      };
    })
    .filter((r) => (r._status ?? "").toLowerCase() !== "inactive")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ _status: _, ...rest }) => rest);

  // ── Card 6: MIA — UL in last 2 weeks (minCount 1) + missing today ────────
  const ulRes = await queryEbrightHrfs<LeaveRow>(
    `SELECT "EmployeeCode" AS employee_code,
            "EmployeeName" AS employee_name,
            "LeaveTypeCode" AS leave_type_code,
            to_char("LeaveDate", 'YYYY-MM-DD') AS leave_date
       FROM public."LeaveTransaction"
      WHERE "ApplyStatus" = 'A'
        AND "LeaveTypeCode" = 'UL'
        AND "LeaveDate" >= $1::date AND "LeaveDate" <= $2::date`,
    [addDaysIso(today, -14), today],
  );
  const ulPerEmp = new Map<string, { count: number; sample: LeaveRow }>();
  for (const r of ulRes.rows) {
    const key = r.employee_code ?? r.employee_name ?? "";
    if (!key) continue;
    const e = ulPerEmp.get(key);
    if (e) e.count += 1;
    else ulPerEmp.set(key, { count: 1, sample: r });
  }
  const ulList: (BasicListItem & { kind: "UL" })[] = [...ulPerEmp.entries()]
    .map(([, v]) => {
      const resolved = resolveName(v.sample.employee_code, v.sample.employee_name);
      return {
        empNo: v.sample.employee_code,
        name: resolved.name,
        branch: resolved.branch,
        role: resolved.role,
        detail: `${v.count}× UL last 2 weeks`,
        kind: "UL" as const,
        _status: resolved.status,
      };
    })
    .filter((r) => (r._status ?? "").toLowerCase() !== "inactive")
    .map(({ _status: _, ...rest }) => rest);

  // "Missing today" portion of MIA: active BranchStaff with workingHours[today]
  // not null, whose scheduled start has passed, minus scanned/leave/justified.
  const todayDayKey = dayKeyOf(today);
  const dayStart = new Date(Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
    -8, 0, 0,
  ));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);

  // Today's scans (ST-remapped to true empNos).
  const scanRes = await queryEbrightHrfs<{ person_id: string; device_id: string | null }>(
    `SELECT DISTINCT person_id, device_id
       FROM public.hikvision_attendance_all
      WHERE event_time >= $1 AND event_time < $2
        AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'`,
    [dayStart.toISOString(), dayEnd.toISOString()],
  );
  const scannedEmpNos = new Set<string>();
  for (const r of scanRes.rows) {
    const remapped = remapStScan(r.device_id, r.person_id);
    scannedEmpNos.add(remapped.personId);
  }
  // Today's leaves (any code).
  const todayLeaveRes = await queryEbrightHrfs<{ emp_code: string | null; emp_name: string | null }>(
    `SELECT DISTINCT "EmployeeCode" AS emp_code, "EmployeeName" AS emp_name
       FROM public."LeaveTransaction"
      WHERE "ApplyStatus" = 'A' AND "LeaveDate" = $1::date`,
    [today],
  );
  const onLeaveEmpNos = new Set<string>();
  for (const r of todayLeaveRes.rows) {
    if (r.emp_code) onLeaveEmpNos.add(r.emp_code);
    if (r.emp_name) {
      const bs = staffByName.get(r.emp_name.trim().toLowerCase());
      if (bs?.employee_id) onLeaveEmpNos.add(bs.employee_id);
    }
  }
  // Today's justifications.
  const justRes = await queryEbrightHrfs<{ emp_no: string | null }>(
    `SELECT DISTINCT emp_no FROM public.attendance_justification
       WHERE just_date = $1::date`,
    [today],
  );
  const justifiedEmpNos = new Set<string>();
  for (const r of justRes.rows) if (r.emp_no) justifiedEmpNos.add(r.emp_no);

  // Compute the missing-today set.
  // Apply: active BranchStaff with branch IN ('HQ','ST'), workingHours[today]
  // is an object, scheduled start has passed, not scanned/leave/justified.
  const nowMytMs = Date.now() + 8 * 3600_000;
  const nowHm = (() => {
    const d = new Date(nowMytMs);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  })();

  const miaMissingToday: (BasicListItem & { kind: "MissingToday" })[] = activeStaff
    .filter((s) => {
      if (!s.branch || !["HQ", "ST"].includes(s.branch)) return false;
      const slot = s.working_hours?.[todayDayKey];
      if (!slot) return false;
      if (slot.start && slot.start > nowHm) return false;
      if (!s.employee_id) return false;
      if (scannedEmpNos.has(s.employee_id)) return false;
      if (onLeaveEmpNos.has(s.employee_id)) return false;
      if (justifiedEmpNos.has(s.employee_id)) return false;
      return true;
    })
    .map((s) => ({
      empNo: s.employee_id,
      name: s.name ?? s.employee_id ?? `Staff #${s.id}`,
      branch: s.branch,
      role: s.role,
      detail: "Missing today",
      kind: "MissingToday" as const,
    }));

  // Merge UL + missing today (dedup by empNo, missing-today shows even when UL too)
  const miaMergedMap = new Map<string, BasicListItem & { kind: "UL" | "MissingToday" }>();
  for (const r of ulList) {
    const k = r.empNo ?? r.name;
    miaMergedMap.set(k, r);
  }
  for (const r of miaMissingToday) {
    const k = r.empNo ?? r.name;
    if (!miaMergedMap.has(k)) miaMergedMap.set(k, r);
  }
  const mia = [...miaMergedMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    month: monthIso.slice(0, 7),
    today,
    counts: {
      onboarding: onboarding.length,
      offboarding: offboarding.length,
      annualLeave: annualLeave.length,
      mc: mc.length,
      flagged: flagged.length,
      mia: mia.length,
      miaUl: ulList.length,
      miaMissingToday: miaMissingToday.length,
    },
    leadsDbAvailable: isLeadsAvailable(),
    cards: { onboarding, offboarding, annualLeave, mc, flagged, mia },
  });
}
