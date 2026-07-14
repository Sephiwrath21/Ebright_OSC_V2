import "server-only";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { queryLeadsDb, isLeadsAvailable } from "@/lib/leads-db";
import { remapStScan } from "@/lib/scan-identity";

// Cached autocount_employee_map lookup. Loaded lazily on first call so the
// pages that don't use it pay nothing. Cleared on process restart. When
// LEADS_DB_URL isn't set, returns an empty map and isLeadsAvailable() → false
// (graceful no-op).
let autocountCache: Map<string, { name: string; role: string | null; branch: string | null; isInactive: boolean }> | null = null;
async function getAutocountMap() {
  if (autocountCache) return autocountCache;
  const map = new Map<string, { name: string; role: string | null; branch: string | null; isInactive: boolean }>();
  if (!isLeadsAvailable()) {
    autocountCache = map; // cache empty so we don't re-check the env per call
    return map;
  }
  try {
    const res = await queryLeadsDb<{
      autocount_code: string;
      name: string | null;
      role: string | null;
      branch: string | null;
      status: string | null;
    }>(
      `SELECT m.autocount_code, bs.name, bs.role, bs.branch, bs.status
         FROM public.autocount_employee_map m
         LEFT JOIN hrfs."BranchStaff" bs ON bs.id = m.branchstaff_id`,
    );
    if (res) {
      for (const r of res.rows) {
        if (r.autocount_code && r.name) {
          map.set(r.autocount_code, {
            name: r.name,
            role: r.role,
            branch: r.branch,
            isInactive: (r.status ?? "").toLowerCase() === "inactive",
          });
        }
      }
    }
  } catch (e) {
    console.warn("[hr-dashboard-stats] autocount lookup failed:", (e as Error).message);
  }
  autocountCache = map;
  return map;
}

// Stats used on both the HR Dashboard page (/induction/hr-dashboard) and the
// /api/hr-dashboard endpoint. Kept in one place so they can't drift.

export interface DashStaffPreview {
  empNo: string | null;
  name: string;
  branch: string | null;
  role: string | null;
  detail?: string | null;
}

// Reusable subquery — most recent MedicalLeave row per employee, used as
// a name-resolution fallback for PT staff (e.g. EBPT###) that don't have
// a BranchStaff record.
const ML_FALLBACK_JOIN = `
  LEFT JOIN (
    SELECT DISTINCT ON ("employeeCode")
           "employeeCode" AS employee_code,
           name, position, branch
      FROM public."MedicalLeave"
     WHERE "employeeCode" IS NOT NULL AND name IS NOT NULL AND name <> ''
     ORDER BY "employeeCode", "createdAt" DESC
  ) ml ON ml.employee_code = lt."EmployeeCode"
`;
type MedicalLeaveFallback = {
  ml_name: string | null;
  ml_branch: string | null;
  ml_position: string | null;
};

// ── Flagged: > 2 approved SL leaves in the selected month ──────────────
export async function getFlaggedThisMonth(
  yyyyMm: string, // "YYYY-MM"
): Promise<DashStaffPreview[]> {
  const [y, m] = yyyyMm.split("-").map(Number);
  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const rows = await queryEbrightHrfs<{
    employee_code: string | null;
    employee_name: string | null;
    bs_name: string | null;
    bs_branch: string | null;
    bs_role: string | null;
    bs_status: string | null;
  } & MedicalLeaveFallback>(
    `SELECT lt."EmployeeCode" AS employee_code,
            lt."EmployeeName" AS employee_name,
            bs.name AS bs_name,
            bs.branch AS bs_branch,
            bs.role AS bs_role,
            bs.status AS bs_status,
            ml.name AS ml_name,
            ml.branch AS ml_branch,
            ml.position AS ml_position
       FROM public."LeaveTransaction" lt
       LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = lt."EmployeeCode"
       ${ML_FALLBACK_JOIN}
      WHERE lt."ApplyStatus" = 'A'
        AND lt."LeaveTypeCode" = 'SL'
        AND lt."LeaveDate" >= $1::date AND lt."LeaveDate" <= $2::date`,
    [firstDay, lastDay],
  );

  const autocount = await getAutocountMap();
  const perEmp = new Map<string, {
    count: number;
    name: string;
    empNo: string | null;
    branch: string | null;
    role: string | null;
    isInactive: boolean;
  }>();
  for (const r of rows.rows) {
    const key = r.employee_code ?? r.employee_name ?? "";
    if (!key) continue;
    const e = perEmp.get(key);
    if (e) {
      e.count += 1;
    } else {
      // Name resolution chain: BranchStaff → LeaveTransaction.EmployeeName
      // → MedicalLeave.name → autocount_employee_map → raw code.
      const ac = r.employee_code ? autocount.get(r.employee_code) : undefined;
      perEmp.set(key, {
        count: 1,
        name: r.bs_name ?? r.employee_name ?? r.ml_name ?? ac?.name ?? key,
        empNo: r.employee_code,
        branch: r.bs_branch ?? r.ml_branch ?? ac?.branch ?? null,
        role: r.bs_role ?? r.ml_position ?? ac?.role ?? null,
        isInactive:
          (r.bs_status ?? "").toLowerCase() === "inactive" ||
          (ac?.isInactive ?? false),
      });
    }
  }
  return [...perEmp.values()]
    .filter((v) => v.count >= 3 && !v.isInactive)
    .sort((a, b) => b.count - a.count)
    .map((v) => ({
      empNo: v.empNo,
      name: v.name,
      branch: v.branch,
      role: v.role,
      detail: `${v.count} SL this month`,
    }));
}

// ── MIA: UL leaves last 2 weeks + "missing today" merged ──────────────
export async function getMia(
  todayMyt: string, // "YYYY-MM-DD"
): Promise<DashStaffPreview[]> {
  // 1) UL leaves in the last 2 weeks
  const [y, m, d] = todayMyt.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - 14)).toISOString().slice(0, 10);

  const ulRes = await queryEbrightHrfs<{
    employee_code: string | null;
    employee_name: string | null;
    bs_name: string | null;
    bs_branch: string | null;
    bs_role: string | null;
    bs_status: string | null;
  } & MedicalLeaveFallback>(
    `SELECT lt."EmployeeCode" AS employee_code,
            lt."EmployeeName" AS employee_name,
            bs.name AS bs_name,
            bs.branch AS bs_branch,
            bs.role AS bs_role,
            bs.status AS bs_status,
            ml.name AS ml_name,
            ml.branch AS ml_branch,
            ml.position AS ml_position
       FROM public."LeaveTransaction" lt
       LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = lt."EmployeeCode"
       ${ML_FALLBACK_JOIN}
      WHERE lt."ApplyStatus" = 'A'
        AND lt."LeaveTypeCode" = 'UL'
        AND lt."LeaveDate" >= $1::date AND lt."LeaveDate" <= $2::date`,
    [start, todayMyt],
  );

  const autocount = await getAutocountMap();
  const ulPerEmp = new Map<string, {
    count: number;
    name: string;
    empNo: string | null;
    branch: string | null;
    role: string | null;
    isInactive: boolean;
  }>();
  for (const r of ulRes.rows) {
    const key = r.employee_code ?? r.employee_name ?? "";
    if (!key) continue;
    const e = ulPerEmp.get(key);
    if (e) {
      e.count += 1;
    } else {
      const ac = r.employee_code ? autocount.get(r.employee_code) : undefined;
      ulPerEmp.set(key, {
        count: 1,
        name: r.bs_name ?? r.employee_name ?? r.ml_name ?? ac?.name ?? key,
        empNo: r.employee_code,
        branch: r.bs_branch ?? r.ml_branch ?? ac?.branch ?? null,
        role: r.bs_role ?? r.ml_position ?? ac?.role ?? null,
        isInactive:
          (r.bs_status ?? "").toLowerCase() === "inactive" ||
          (ac?.isInactive ?? false),
      });
    }
  }
  const ulList: DashStaffPreview[] = [...ulPerEmp.values()]
    .filter((v) => v.count >= 1 && !v.isInactive)
    .map((v) => ({
      empNo: v.empNo,
      name: v.name,
      branch: v.branch,
      role: v.role,
      detail: `${v.count}× UL last 2 weeks`,
    }));

  // 2) Missing today: active BranchStaff scheduled today whose start time
  //    has passed, minus today's scans/leave/justified.
  const dayStart = new Date(Date.UTC(y, m - 1, d, -8, 0, 0));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const dayKey = (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const)[
    new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  ];

  const [activeRes, scanRes, leaveRes, justRes] = await Promise.all([
    queryEbrightHrfs<{
      employee_id: string | null;
      name: string | null;
      branch: string | null;
      role: string | null;
      working_hours: Record<string, { start: string; end: string } | null> | null;
    }>(
      `SELECT "employeeId" AS employee_id, name, branch, role,
              "workingHours" AS working_hours
         FROM public."BranchStaff"
        WHERE status = 'Active' AND branch IN ('HQ','ST') AND "employeeId" IS NOT NULL`,
    ),
    queryEbrightHrfs<{ person_id: string; device_id: string | null }>(
      `SELECT DISTINCT person_id, device_id
         FROM public.hikvision_attendance_all
        WHERE event_time >= $1 AND event_time < $2
          AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'`,
      [dayStart.toISOString(), dayEnd.toISOString()],
    ),
    queryEbrightHrfs<{ emp_code: string | null }>(
      `SELECT DISTINCT "EmployeeCode" AS emp_code
         FROM public."LeaveTransaction"
        WHERE "ApplyStatus" = 'A' AND "LeaveDate" = $1::date`,
      [todayMyt],
    ),
    queryEbrightHrfs<{ emp_no: string | null }>(
      `SELECT DISTINCT emp_no FROM public.attendance_justification
         WHERE just_date = $1::date`,
      [todayMyt],
    ),
  ]);

  const scanned = new Set<string>();
  for (const r of scanRes.rows) {
    const remapped = remapStScan(r.device_id, r.person_id);
    scanned.add(remapped.personId);
  }
  const onLeave = new Set<string>();
  for (const r of leaveRes.rows) if (r.emp_code) onLeave.add(r.emp_code);
  const justified = new Set<string>();
  for (const r of justRes.rows) if (r.emp_no) justified.add(r.emp_no);

  const nowMs = Date.now() + 8 * 3600_000;
  const nowMytDate = new Date(nowMs);
  const nowHm = `${String(nowMytDate.getUTCHours()).padStart(2, "0")}:${String(nowMytDate.getUTCMinutes()).padStart(2, "0")}`;

  const missingToday: DashStaffPreview[] = [];
  for (const s of activeRes.rows) {
    if (!s.employee_id) continue;
    const slot = s.working_hours?.[dayKey];
    if (!slot) continue;
    if (slot.start && slot.start > nowHm) continue;
    if (scanned.has(s.employee_id)) continue;
    if (onLeave.has(s.employee_id)) continue;
    if (justified.has(s.employee_id)) continue;
    missingToday.push({
      empNo: s.employee_id,
      name: s.name ?? s.employee_id,
      branch: s.branch,
      role: s.role,
      detail: "Missing today",
    });
  }

  // Merge — UL first, then missing-today (dedup by empNo).
  const merged = new Map<string, DashStaffPreview>();
  for (const r of ulList) merged.set(r.empNo ?? r.name, r);
  for (const r of missingToday) {
    const k = r.empNo ?? r.name;
    if (!merged.has(k)) merged.set(k, r);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function todayMytIso(): string {
  const m = new Date(Date.now() + 8 * 60 * 60_000);
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}-${String(m.getUTCDate()).padStart(2, "0")}`;
}

// ── BranchStaff.signed_date parser ─────────────────────────────────────
// Three formats observed in HRFS:
//   "2026-02-26"        — ISO
//   "5-May-25"          — D-MMM-YY (day with no leading zero, 2-digit year)
//   "10th October 2025" — DDth/st/nd/rd Month YYYY (any case)
// Returns YYYY-MM-DD or null if unparseable.
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
export function parseSignedDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // Format 1: ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // Format 2: D-MMM-YY (e.g. "5-May-25", "31-May-25")
  const dashShort = /^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/.exec(s);
  if (dashShort) {
    const d = Number(dashShort[1]);
    const monthIdx = MONTH_INDEX[dashShort[2].toLowerCase()];
    let y = Number(dashShort[3]);
    if (y < 100) y += 2000;
    if (monthIdx !== undefined && d >= 1 && d <= 31) {
      return `${y}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // Format 3: DDth/st/nd/rd Month YYYY (any case)
  const longForm = /^(\d{1,2})(?:st|nd|rd|th|ST|ND|RD|TH)?\s+([A-Za-z]+)\s+(\d{4})$/i.exec(s);
  if (longForm) {
    const d = Number(longForm[1]);
    const monthIdx = MONTH_INDEX[longForm[2].toLowerCase()];
    const y = Number(longForm[3]);
    if (monthIdx !== undefined && d >= 1 && d <= 31) {
      return `${y}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  return null;
}

// Classify a BranchStaff role into PT / FT / INT / Other bucket.
export function roleBucket(role: string | null | undefined): "PT" | "FT" | "INT" | "Other" {
  if (!role) return "Other";
  const r = role.toUpperCase();
  if (r.includes("INT") || r.includes("INTERN")) return "INT";
  if (/\bPT\b/.test(r) || r.includes("PART")) return "PT";
  if (/\bFT\b/.test(r) || r.includes("FULL")) return "FT";
  if (/\bBM\b/.test(r)) return "FT"; // BM = branch manager, full-time
  return "Other";
}

// ── Onboarding (per spec: start_date in [today-1mo, today+6mo]) ─────────
export interface OnboardingItem extends DashStaffPreview {
  date: string | null;
}
export interface OnboardingResult {
  items: OnboardingItem[];
  /** Splits for the card header: by role bucket + how many signed this month + starting within 2 weeks. */
  ptCount: number;
  ftCount: number;
  intCount: number;
  signedThisMonth: number;
  startingIn2Weeks: number;
}
export async function getOnboarding(todayIso: string): Promise<OnboardingResult> {
  const [y, m, d] = todayIso.split("-").map(Number);
  const startWindow = new Date(Date.UTC(y, m - 1 - 1, d)).toISOString().slice(0, 10); // -1 month
  const endWindow = new Date(Date.UTC(y, m - 1 + 6, d)).toISOString().slice(0, 10); // +6 months
  const twoWeeksAhead = new Date(Date.UTC(y, m - 1, d + 14)).toISOString().slice(0, 10);
  const monthFirst = `${todayIso.slice(0, 7)}-01`;
  const monthLast = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const rows = await queryEbrightHrfs<{
    employee_id: string | null;
    name: string | null;
    branch: string | null;
    role: string | null;
    start_date: string | null;
    signed_date: string | null;
  }>(
    `SELECT "employeeId" AS employee_id, name, branch, role, start_date, signed_date
       FROM public."BranchStaff"
      WHERE status = 'Active'
        AND start_date IS NOT NULL AND start_date <> ''
        AND start_date >= $1 AND start_date <= $2
      ORDER BY start_date ASC`,
    [startWindow, endWindow],
  );

  const items: OnboardingItem[] = rows.rows.map((r) => ({
    empNo: r.employee_id,
    name: r.name ?? r.employee_id ?? "(unknown)",
    branch: r.branch,
    role: r.role,
    date: r.start_date?.slice(0, 10) ?? null,
  }));

  let ptCount = 0, ftCount = 0, intCount = 0, startingIn2Weeks = 0;
  for (const r of rows.rows) {
    const bucket = roleBucket(r.role);
    if (bucket === "PT") ptCount += 1;
    else if (bucket === "FT") ftCount += 1;
    else if (bucket === "INT") intCount += 1;
    if (r.start_date && r.start_date.slice(0, 10) >= todayIso && r.start_date.slice(0, 10) <= twoWeeksAhead) {
      startingIn2Weeks += 1;
    }
  }

  // SIGNED IN: count BranchStaff with parsed signed_date falling in current month.
  // Query separately so we count ALL active staff, not just those in the
  // onboarding window.
  const signedRows = await queryEbrightHrfs<{ signed_date: string | null }>(
    `SELECT signed_date FROM public."BranchStaff"
       WHERE status = 'Active'
         AND signed_date IS NOT NULL AND signed_date <> ''`,
  );
  let signedThisMonth = 0;
  for (const r of signedRows.rows) {
    const parsed = parseSignedDate(r.signed_date);
    if (parsed && parsed >= monthFirst && parsed <= monthLast) signedThisMonth += 1;
  }

  return { items, ptCount, ftCount, intCount, signedThisMonth, startingIn2Weeks };
}

// ── Offboarding (per spec: endDate in [today-1w, today+2mo]) ────────────
export interface OffboardingItem extends DashStaffPreview {
  date: string | null;
}
export interface OffboardingResult {
  items: OffboardingItem[];
  in2Months: number;
  in2Weeks: number;
}
export async function getOffboarding(todayIso: string): Promise<OffboardingResult> {
  const [y, m, d] = todayIso.split("-").map(Number);
  const startWindow = new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
  const endWindow = new Date(Date.UTC(y, m - 1 + 2, d)).toISOString().slice(0, 10);
  const twoWeeksAhead = new Date(Date.UTC(y, m - 1, d + 14)).toISOString().slice(0, 10);

  const rows = await queryEbrightHrfs<{
    employee_id: string | null;
    name: string | null;
    branch: string | null;
    role: string | null;
    end_date: string | null;
  }>(
    `SELECT "employeeId" AS employee_id, name, branch, role, "endDate" AS end_date
       FROM public."BranchStaff"
      WHERE "endDate" IS NOT NULL AND "endDate" <> ''
        AND "endDate" >= $1 AND "endDate" <= $2
      ORDER BY "endDate" ASC`,
    [startWindow, endWindow],
  );

  const items: OffboardingItem[] = rows.rows.map((r) => ({
    empNo: r.employee_id,
    name: r.name ?? r.employee_id ?? "(unknown)",
    branch: r.branch,
    role: r.role,
    date: r.end_date?.slice(0, 10) ?? null,
  }));

  let in2Weeks = 0;
  for (const r of rows.rows) {
    if (r.end_date && r.end_date.slice(0, 10) >= todayIso && r.end_date.slice(0, 10) <= twoWeeksAhead) {
      in2Weeks += 1;
    }
  }
  return { items, in2Months: items.length, in2Weeks };
}

// ── MC: approved non-AL leaves, [today-1mo, today], deduped ─────────────
export interface LeaveItem extends DashStaffPreview {
  date: string;
  leaveTypeCode: string | null;
}
export async function getMcLastMonth(todayIso: string): Promise<LeaveItem[]> {
  const [y, m, d] = todayIso.split("-").map(Number);
  const monthAgo = new Date(Date.UTC(y, m - 2, d)).toISOString().slice(0, 10);

  const rows = await queryEbrightHrfs<{
    employee_code: string | null;
    employee_name: string | null;
    bs_name: string | null;
    bs_branch: string | null;
    bs_role: string | null;
    bs_status: string | null;
    leave_type_code: string | null;
    leave_date: string;
  } & MedicalLeaveFallback>(
    `SELECT DISTINCT ON (lt."EmployeeCode", lt."LeaveDate", lt."LeaveTypeCode")
            lt."EmployeeCode" AS employee_code,
            lt."EmployeeName" AS employee_name,
            bs.name AS bs_name,
            bs.branch AS bs_branch,
            bs.role AS bs_role,
            bs.status AS bs_status,
            ml.name AS ml_name,
            ml.branch AS ml_branch,
            ml.position AS ml_position,
            lt."LeaveTypeCode" AS leave_type_code,
            to_char(lt."LeaveDate", 'YYYY-MM-DD') AS leave_date
       FROM public."LeaveTransaction" lt
       LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = lt."EmployeeCode"
       ${ML_FALLBACK_JOIN}
      WHERE lt."ApplyStatus" = 'A'
        AND lt."LeaveTypeCode" <> 'AL'
        AND lt."LeaveDate" >= $1::date AND lt."LeaveDate" <= $2::date`,
    [monthAgo, todayIso],
  );

  const autocount = await getAutocountMap();
  return rows.rows
    .map((r) => {
      const ac = r.employee_code ? autocount.get(r.employee_code) : undefined;
      const isInactive =
        (r.bs_status ?? "").toLowerCase() === "inactive" ||
        (ac?.isInactive ?? false);
      return {
        _isInactive: isInactive,
        empNo: r.employee_code,
        name: r.bs_name ?? r.employee_name ?? r.ml_name ?? ac?.name ?? r.employee_code ?? "(unknown)",
        branch: r.bs_branch ?? r.ml_branch ?? ac?.branch ?? null,
        role: r.bs_role ?? r.ml_position ?? ac?.role ?? null,
        date: r.leave_date,
        leaveTypeCode: r.leave_type_code,
        detail: r.leave_type_code,
      };
    })
    .filter((r) => !r._isInactive)
    .map(({ _isInactive: _, ...rest }) => rest)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── AL: approved AL, [today, today+14d], deduped ────────────────────────
export async function getAnnualLeaveNext2Weeks(todayIso: string): Promise<LeaveItem[]> {
  const [y, m, d] = todayIso.split("-").map(Number);
  const twoWeeksAhead = new Date(Date.UTC(y, m - 1, d + 14)).toISOString().slice(0, 10);

  const rows = await queryEbrightHrfs<{
    employee_code: string | null;
    employee_name: string | null;
    bs_name: string | null;
    bs_branch: string | null;
    bs_role: string | null;
    bs_status: string | null;
    leave_type_code: string | null;
    leave_date: string;
  } & MedicalLeaveFallback>(
    `SELECT DISTINCT ON (lt."EmployeeCode", lt."LeaveDate", lt."LeaveTypeCode")
            lt."EmployeeCode" AS employee_code,
            lt."EmployeeName" AS employee_name,
            bs.name AS bs_name,
            bs.branch AS bs_branch,
            bs.role AS bs_role,
            bs.status AS bs_status,
            ml.name AS ml_name,
            ml.branch AS ml_branch,
            ml.position AS ml_position,
            lt."LeaveTypeCode" AS leave_type_code,
            to_char(lt."LeaveDate", 'YYYY-MM-DD') AS leave_date
       FROM public."LeaveTransaction" lt
       LEFT JOIN public."BranchStaff" bs ON bs."employeeId" = lt."EmployeeCode"
       ${ML_FALLBACK_JOIN}
      WHERE lt."ApplyStatus" = 'A'
        AND lt."LeaveTypeCode" = 'AL'
        AND lt."LeaveDate" >= $1::date AND lt."LeaveDate" <= $2::date`,
    [todayIso, twoWeeksAhead],
  );

  const autocount = await getAutocountMap();
  return rows.rows
    .map((r) => {
      const ac = r.employee_code ? autocount.get(r.employee_code) : undefined;
      const isInactive =
        (r.bs_status ?? "").toLowerCase() === "inactive" ||
        (ac?.isInactive ?? false);
      return {
        _isInactive: isInactive,
        empNo: r.employee_code,
        name: r.bs_name ?? r.employee_name ?? r.ml_name ?? ac?.name ?? r.employee_code ?? "(unknown)",
        branch: r.bs_branch ?? r.ml_branch ?? ac?.branch ?? null,
        role: r.bs_role ?? r.ml_position ?? ac?.role ?? null,
        date: r.leave_date,
        leaveTypeCode: r.leave_type_code,
        detail: "AL",
      };
    })
    .filter((r) => !r._isInactive)
    .map(({ _isInactive: _, ...rest }) => rest)
    .sort((a, b) => a.date.localeCompare(b.date));
}
