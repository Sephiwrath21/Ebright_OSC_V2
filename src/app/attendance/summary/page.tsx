import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfsSource } from "@/lib/ebright-hrfs-source";
import { refreshAndReadAttendance } from "@/lib/attendance-all";
import AppShell from "@/app/components/AppShell";
import AttendanceSummaryView, {
  type SummaryData,
  type AttendanceRow,
  type BranchOption,
  type AbsenceKind,
} from "@/app/components/AttendanceSummaryView";
import { ShieldAlert } from "lucide-react";
import { type WeeklySchedule } from "@/lib/schedule-history";
import { assignedBranchOnDay, rotationFor } from "@/lib/staff-rotation";

// Leave code that means "unpaid / unexplained" — anyone with this leave-type
// for the day is bucketed as MIA; any other leave code is bucketed as On Leave.
const MIA_LEAVE_CODE = "UL";

export const dynamic = "force-dynamic";

const ALLOWED_ROLE_TYPES = new Set(["superadmin", "ceo", "hr"]);
// role_ids that represent real, badge-carrying staff shown in attendance:
// ceo(2), regional manager(5), staff(6), hod(7). Excludes generic/shared
// accounts — superadmin(1), department(3), branch(4).
const ATTENDANCE_ROLE_IDS = [2, 5, 6, 7];
// Late = first scan > scheduled start + this grace.
const LATE_GRACE_MINUTES = 1;
// "Scanner online" if a scan came in within this many minutes.
const SCANNER_ONLINE_WINDOW_MIN = 10;
// Business rule: a scan strictly before this MYT time doesn't count as a
// check-out — it's treated as a duplicate scan / quick step-out. The person
// stays "Currently In" until a scan at or after the cutoff happens.
const CHECKOUT_EARLIEST_MYT = "14:00";

const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

// Hikvision device_name → branch_code. Only HQ + ST have scanners synced into
// hikvision_attendance_all today; everything else returns null (so visitor
// detection only meaningfully runs for those branches). Extend as new
// scanners come online.
function deviceBranchCode(deviceName: string | null): string | null {
  if (!deviceName) return null;
  const lower = deviceName.toLowerCase();
  if (lower.includes("scanner main") || lower.startsWith("hq ")) return "HQ";
  if (lower.includes("scanner st")) return "ST";
  return null;
}

interface PageProps {
  searchParams: Promise<{ branch?: string; date?: string }>;
}

function parseMytDate(iso: string | undefined): Date {
  if (!iso) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date();
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 4, 0, 0));
}

function formatMytIsoDate(d: Date): string {
  const myt = new Date(d.getTime() + 8 * 60 * 60_000);
  return `${myt.getUTCFullYear()}-${String(myt.getUTCMonth() + 1).padStart(2, "0")}-${String(myt.getUTCDate()).padStart(2, "0")}`;
}

function dayKeyForMytDate(d: Date): DayKey {
  const myt = new Date(d.getTime() + 8 * 60 * 60_000);
  return DAY_KEYS[myt.getUTCDay()];
}


// Convert a UTC Date to "HH:MM" in MYT.
function utcToMytHm(d: Date): string {
  const myt = new Date(d.getTime() + 8 * 60 * 60_000);
  return `${String(myt.getUTCHours()).padStart(2, "0")}:${String(myt.getUTCMinutes()).padStart(2, "0")}`;
}

function classifyLate(
  scanMytHm: string,
  scheduledStart: string,
  graceMin: number,
): "late" | "on_time" {
  const ms = /^(\d{2}):(\d{2})/.exec(scheduledStart);
  const mc = /^(\d{2}):(\d{2})/.exec(scanMytHm);
  if (!ms || !mc) return "on_time";
  const startMin = Number(ms[1]) * 60 + Number(ms[2]);
  const clockMin = Number(mc[1]) * 60 + Number(mc[2]);
  return clockMin > startMin + graceMin ? "late" : "on_time";
}

function classifyEarly(
  scanMytHm: string,
  scheduledEnd: string,
): "early" | "normal" {
  const me = /^(\d{2}):(\d{2})/.exec(scheduledEnd);
  const mc = /^(\d{2}):(\d{2})/.exec(scanMytHm);
  if (!me || !mc) return "normal";
  const endMin = Number(me[1]) * 60 + Number(me[2]);
  const clockMin = Number(mc[1]) * 60 + Number(mc[2]);
  return clockMin < endMin ? "early" : "normal";
}

// Flattened shape coming out of the LOCAL employment query. Field names kept
// identical to the old BranchStaff version so the downstream classification
// code didn't need to change.
interface LocalStaffRow {
  /** employment_id — used as the key into schedulesByDate (history rows). */
  id: number;
  user_id: number;
  name: string | null;
  /** branch.branch_code, e.g. "HQ", "ST", "AMP". */
  branch: string | null;
  role: string | null;
  position: string | null;
  department: string | null;
  location: string | null;
  /** employment.employee_id — same value as BranchStaff.employeeId on HRFS. */
  employeeId: string | null;
  workingHours: Record<string, { start: string; end: string } | null> | null;
}

// One aggregated row per person from hikvision_attendance_all (after id-map
// translation). Times are UTC, computed by min/max over today's events.
interface AggregatedScan {
  emp_no: string;
  first_event: Date;
  last_event: Date;
  scan_count: number;
  sample_device_name: string | null;
}

export default async function AttendanceSummaryPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });

  const userEmail = session.user.email;
  const userName = session.user.name ?? null;
  const userRole = (session.user as { role?: string } | undefined)?.role ?? "USER";

  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  if (!ALLOWED_ROLE_TYPES.has(roleType)) {
    return (
      <AppShell email={userEmail} role={userRole} name={userName}>
        <div className="min-h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-900 flex items-center justify-center mb-5">
              <ShieldAlert className="w-7 h-7 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Restricted Access</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              The attendance summary is available to HR, CEO, and superadmin roles only.
            </p>
            <Link
              href="/attendance"
              className="mt-6 inline-flex items-center h-10 px-4 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Back to Attendance
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const sp = await searchParams;
  const refDate = parseMytDate(sp.date);
  const selectedDate = formatMytIsoDate(refDate);
  const dayKey = dayKeyForMytDate(refDate);

  // Branch dropdown reads from local `branch` table; its branch_code matches
  // BranchStaff.branch on HRFS.
  const branches = await prisma.branch.findMany({
    select: { branch_id: true, branch_name: true, branch_code: true },
    orderBy: { branch_name: "asc" },
  });
  const branchOptions: BranchOption[] = branches.map((b) => ({
    branch_id: b.branch_id,
    branch_name: b.branch_name,
    branch_code: b.branch_code,
  }));

  const requestedBranchId =
    sp.branch && sp.branch !== "all" ? Number(sp.branch) : NaN;
  const selectedBranch = Number.isFinite(requestedBranchId)
    ? branchOptions.find((b) => b.branch_id === requestedBranchId) ?? null
    : null;
  const branchCode = selectedBranch?.branch_code ?? null;

  // ── PORTAL roster (users + employment), keyed by user_id — replaces the
  //    external HRFS BranchStaff list. Attendance scans link by
  //    employment.employee_id (= hikvision_attendance_all.person_id). Coverage
  //    is bounded by how many active employments carry a correct employee_id
  //    and a synced schedule (accepted tradeoff vs the BranchStaff roster).
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

  // schedulesByDate: latest version whose effective_from <= selectedDate, keyed
  // by employment_id — mirrors the old BranchStaffSchedule DISTINCT ON query.
  const schedulesByDate: Record<number, WeeklySchedule> = {};
  const seenUsers = new Set<number>();
  const allStaff: LocalStaffRow[] = [];
  for (const e of employments) {
    if (seenUsers.has(e.user_id)) continue; // one active employment per user
    seenUsers.add(e.user_id);
    allStaff.push({
      id: e.employment_id, // schedule-history key (was BranchStaff.id)
      user_id: e.user_id,
      name: e.users.user_profile?.full_name ?? e.users.user_profile?.nick_name ?? null,
      branch: e.branch?.branch_code ?? null,
      role: null,
      position: e.position ?? null,
      department: e.department?.department_name ?? null,
      location: e.branch?.branch_name ?? null,
      employeeId: e.employee_id,
      workingHours: (e.working_hours_json as LocalStaffRow["workingHours"]) ?? null,
    });
    let best: { eff: string; schedule: WeeklySchedule } | null = null;
    for (const v of e.schedule_versions) {
      const eff = v.effective_from.toISOString().slice(0, 10);
      if (eff <= selectedDate && (!best || eff > best.eff)) {
        best = { eff, schedule: v.schedule as WeeklySchedule };
      }
    }
    if (best) schedulesByDate[e.employment_id] = best.schedule;
  }
  const staffByEmpNo = new Map<string, LocalStaffRow>();
  for (const s of allStaff) {
    if (s.employeeId) staffByEmpNo.set(s.employeeId, s);
  }

  // Resolve every staff's effective schedule for selectedDate, then keep only
  // those whose schedule has a non-null entry for today's dayKey. Rotation
  // (Feature 5) can also pull a staff in even if their schedule lives at a
  // different branch.
  function resolvedDayScheduleFor(s: LocalStaffRow): WeeklySchedule | null {
    if (s.id in schedulesByDate) {
      // History exists for this staff — schedulesByDate is authoritative.
      // (object → use it, null → no version covers selectedDate → no schedule)
      return schedulesByDate[s.id];
    }
    // No history → fall back to the cached current workingHours.
    return (s.workingHours as WeeklySchedule | null) ?? null;
  }

  // Staff who are "expected" at the selected branch on this date.
  // - If a branch is selected, include staff whose BranchStaff.branch matches
  //   OR whose rotation puts them at the selected branch today.
  // - If no branch selected (All branches), include every active staff that
  //   has a schedule for today.
  const scheduledStaff: Array<{
    staff: LocalStaffRow;
    schedule: { start: string; end: string };
    /** Effective branch for today (rotation can override BranchStaff.branch). */
    branchForDay: string | null;
  }> = [];
  for (const s of allStaff) {
    const resolved = resolvedDayScheduleFor(s);
    const day = resolved?.[dayKey] ?? null;
    if (!day) continue; // off-day or no schedule yet → not in scope

    const rotationBranch = assignedBranchOnDay(s.employeeId, dayKey);
    const branchForDay = rotationBranch ?? s.branch ?? null;

    if (branchCode && branchForDay !== branchCode) continue;

    scheduledStaff.push({ staff: s, schedule: day, branchForDay });
  }

  // Employee codes of everyone in scope today — used below to separate
  // "visitor" scans (people who scanned but weren't expected) from the
  // expected/scheduled population.
  const scheduledEmpNos = new Set(
    scheduledStaff
      .map(({ staff }) => staff.employeeId)
      .filter((id): id is string => !!id),
  );

  // ── attendance_all: normalized daily scans (single v2 source) ────────────
  // Sync-on-view pulls the selected day from the Hikvision log into
  // attendance_all first, then we read it back. clock_in/out are MYT wall-clock
  // "HH:MM:SS"; rebuild the check-in/out as true instants (…+08:00) so the
  // existing utcToMytHm() classification downstream is unchanged.
  const attRows = await refreshAndReadAttendance(selectedDate, selectedDate);
  const aggregated: AggregatedScan[] = attRows
    .filter((r) => r.clock_in)
    .map((r) => ({
      emp_no: r.emp_no,
      first_event: new Date(`${r.day}T${r.clock_in}+08:00`),
      last_event: new Date(`${r.day}T${r.clock_out ?? r.clock_in}+08:00`),
      scan_count: r.scan_count,
      sample_device_name: r.device_name,
    }));
  const scanByEmpNo = new Map<string, AggregatedScan>();
  for (const s of aggregated) scanByEmpNo.set(s.emp_no, s);

  // "Scanner online" + "Records today" from the same materialized rows.
  let lastScanTs: Date | null = null;
  let recordsToday = 0;
  for (const a of aggregated) {
    recordsToday += a.scan_count;
    if (!lastScanTs || a.last_event.getTime() > lastScanTs.getTime()) lastScanTs = a.last_event;
  }
  const scannerOnline = lastScanTs
    ? Date.now() - lastScanTs.getTime() < SCANNER_ONLINE_WINDOW_MIN * 60_000
    : false;

  // When attendance_all was last refreshed for this date — drives "Synced … ago".
  let lastSyncedAt: Date | null = null;
  for (const r of attRows) {
    if (!r.synced_at) continue;
    const d = new Date(r.synced_at);
    if (!lastSyncedAt || d.getTime() > lastSyncedAt.getTime()) lastSyncedAt = d;
  }

  // ── HRFS: leave records covering selectedDate ────────────────────────────
  // Match by EmployeeCode (= BranchStaff.employeeId), with a name fallback for
  // legacy rows that have NULL EmployeeCode. LeaveTransaction has no
  // LeaveTypeName column on HRFS — we just surface the code (e.g. "SL", "AL",
  // "UL") and let the UI render it.
  const leaveResult = await queryEbrightHrfsSource<{
    employee_code: string | null;
    employee_name: string | null;
    leave_type_code: string | null;
  }>(
    `SELECT "EmployeeCode" AS employee_code,
            "EmployeeName" AS employee_name,
            "LeaveTypeCode" AS leave_type_code
       FROM public."LeaveTransaction"
      WHERE "LeaveDate" = $1::date`,
    [selectedDate],
  );
  const leaveByEmpCode = new Map<string, { code: string | null; name: string | null }>();
  const leaveByName = new Map<string, { code: string | null; name: string | null }>();
  for (const r of leaveResult.rows) {
    const entry = { code: r.leave_type_code, name: null };
    if (r.employee_code) leaveByEmpCode.set(r.employee_code, entry);
    if (r.employee_name) leaveByName.set(r.employee_name.trim().toLowerCase(), entry);
  }
  function leaveFor(staff: LocalStaffRow) {
    if (staff.employeeId) {
      const byCode = leaveByEmpCode.get(staff.employeeId);
      if (byCode) return byCode;
    }
    if (staff.name) {
      const byName = leaveByName.get(staff.name.trim().toLowerCase());
      if (byName) return byName;
    }
    return null;
  }

  // ── HRFS: HR-entered justifications for selectedDate ─────────────────────
  // Reads HRFS public.attendance_justification (the spec's schema —
  // emp_no/reason/evidence_url/...). Keyed by emp_no since that's how it
  // joins to BranchStaff.employeeId. Same row drops the person from Missing
  // and surfaces them in the Justify side box.
  const justificationsRes = await queryEbrightHrfsSource<{
    id: string;
    emp_no: string | null;
    reason: string | null;
    evidence_url: string | null;
  }>(
    `SELECT id::text, emp_no, reason, evidence_url
       FROM public.attendance_justification
      WHERE just_date = $1::date`,
    [selectedDate],
  );
  const justificationByEmpNo = new Map<string, { id: string; reason: string | null; evidence_url: string | null }>();
  for (const j of justificationsRes.rows) {
    if (j.emp_no) {
      justificationByEmpNo.set(j.emp_no, { id: j.id, reason: j.reason, evidence_url: j.evidence_url });
    }
  }

  // ── Expected rows ──────────────────────────────────────────────────────
  // One row per staff member who is scheduled to work today (scheduledStaff,
  // built above from BranchStaff + BranchStaffSchedule + rotation).
  const expectedRows: AttendanceRow[] = scheduledStaff.map(({ staff: s, schedule: sched, branchForDay }) => {
    const scan = s.employeeId ? scanByEmpNo.get(s.employeeId) ?? null : null;
    const checkInDate = scan?.first_event ?? null;
    const checkOutDate =
      scan
      && scan.last_event.getTime() > scan.first_event.getTime()
      && utcToMytHm(scan.last_event) >= CHECKOUT_EARLIEST_MYT
        ? scan.last_event
        : null;

    const inStatus: AttendanceRow["in_status"] = checkInDate
      ? classifyLate(utcToMytHm(checkInDate), sched.start, LATE_GRACE_MINUTES)
      : null;
    const outStatus: AttendanceRow["out_status"] = checkOutDate
      ? classifyEarly(utcToMytHm(checkOutDate), sched.end)
      : null;

    // Absence classification — only for staff who didn't scan.
    //   priority: HR justification → leave record → plain missing
    let absenceKind: AbsenceKind = null;
    let leaveCode: string | null = null;
    let leaveName: string | null = null;
    const just = s.employeeId ? justificationByEmpNo.get(s.employeeId) ?? null : null;
    if (!checkInDate && !checkOutDate) {
      if (just) {
        absenceKind = "justified";
        leaveCode = just.reason;
        leaveName = just.evidence_url; // surfaces as the leave_type_name field
      } else {
        const lv = leaveFor(s);
        if (lv) {
          leaveCode = lv.code;
          leaveName = lv.name;
          // Per spec: UL leaves are excluded from On Leave on the Summary
          // (they appear in HR Dashboard's MIA card instead). For now we
          // still tag them as on_leave so they're visible somewhere — switch
          // to hiding entirely when MIA panel is removed.
          absenceKind = lv.code === MIA_LEAVE_CODE ? "mia" : "on_leave";
        } else {
          absenceKind = "missing";
        }
      }
    }

    // Rotation: if today's assigned branch differs from the staff's home
    // branch, that's a visiting situation (they're "based" elsewhere but
    // expected here). We surface it as a chip so HQ-viewing staff understand
    // the row's context.
    const rotation = rotationFor(s.employeeId);
    const visitingFrom =
      rotation && branchForDay && rotation.homeBranchCode !== branchForDay
        ? rotation.homeBranchCode
        : null;

    return {
      // user_id slot now holds BranchStaff.id since staff list comes from HRFS.
      // (No local user_id available without a separate lookup; not currently
      // needed for display since the Justify modal is disabled in read-only.)
      user_id: s.id,
      name: s.name ?? s.employeeId ?? `Staff #${s.id}`,
      employee_code: s.employeeId ?? null,
      department: s.department ?? s.location ?? null,
      position: s.position ?? s.role ?? null,
      check_in: checkInDate?.toISOString() ?? null,
      check_out: checkOutDate?.toISOString() ?? null,
      in_status: inStatus,
      out_status: outStatus,
      scans: scan?.scan_count ?? 0,
      home_branch_code: s.branch ?? null,
      visiting_from: visitingFrom,
      absence_kind: absenceKind,
      leave_type_code: leaveCode,
      leave_type_name: leaveName,
      // Justify modal is disabled for now (read-only HRFS). Pre-fill data
      // converted into the view's existing shape for display purposes only.
      justification: just
        ? { id: Number(just.id), reason: just.reason ?? "", note: just.evidence_url }
        : null,
    };
  });

  // ── Visitor rows ─────────────────────────────────────────────────────────
  // A scan whose empNo isn't in the scheduled-scope set, and which happened
  // at a scanner mapped to the selected branch (HQ or ST today). Only
  // meaningful when a branch is selected.
  const visitorRows: AttendanceRow[] = [];
  if (selectedBranch) {
    for (const scan of aggregated) {
      if (scheduledEmpNos.has(scan.emp_no)) continue;
      const staff = staffByEmpNo.get(scan.emp_no) ?? null;
      if (!staff) continue; // unknown empNo — skip rather than show noise

      // Where did they actually scan? Use the first scan's device.
      const scannedAtBranch = deviceBranchCode(scan.sample_device_name);
      if (!scannedAtBranch || scannedAtBranch !== branchCode) continue;

      // If they scanned at their own home branch, they're not a visitor —
      // they're just not scheduled today.
      if (staff.branch === branchCode) continue;

      const checkInDate = scan.first_event;
      const checkOutDate =
        scan.last_event.getTime() > scan.first_event.getTime()
        && utcToMytHm(scan.last_event) >= CHECKOUT_EARLIEST_MYT
          ? scan.last_event
          : null;

      visitorRows.push({
        user_id: staff.user_id,
        name: staff.name ?? `Emp ${scan.emp_no}`,
        employee_code: scan.emp_no,
        department: staff.department ?? staff.location ?? null,
        position: staff.position ?? staff.role ?? null,
        check_in: checkInDate.toISOString(),
        check_out: checkOutDate?.toISOString() ?? null,
        // No schedule context for visitors (they're working outside their
        // home branch today) — surface times without late/early judgment.
        in_status: "on_time",
        out_status: checkOutDate ? "normal" : null,
        scans: scan.scan_count,
        home_branch_code: staff.branch ?? null,
        visiting_from: staff.branch ?? "another branch",
        absence_kind: null,
        leave_type_code: null,
        leave_type_name: null,
        justification: null,
      });
    }
  }

  const rows: AttendanceRow[] = [...expectedRows, ...visitorRows];

  // Sort by check-in time DESCENDING (latest scanners at the top — matches
  // the reference portal's layout). People who didn't scan today sort to the
  // bottom, secondary-sorted by name so the absent block has a stable order.
  rows.sort((a, b) => {
    if (a.check_in && b.check_in) return b.check_in.localeCompare(a.check_in);
    if (a.check_in) return -1;
    if (b.check_in) return 1;
    return a.name.localeCompare(b.name);
  });

  // ── Counters (assigned-only for absence math; visitors counted separately) ─
  const expectedScanned = expectedRows.filter(
    (r) => r.check_in || r.check_out,
  ).length;
  const currentlyIn = rows.filter((r) => r.check_in && !r.check_out).length;
  const checkedOut = rows.filter((r) => r.check_in && r.check_out).length;
  const totalEmployees = expectedRows.length;
  const missing   = expectedRows.filter((r) => r.absence_kind === "missing").length;
  const onLeave   = expectedRows.filter((r) => r.absence_kind === "on_leave").length;
  const mia       = expectedRows.filter((r) => r.absence_kind === "mia").length;
  const justified = expectedRows.filter((r) => r.absence_kind === "justified").length;
  const scanned = expectedScanned + visitorRows.length;

  const data: SummaryData = {
    branches: branchOptions,
    selectedBranch,
    selectedDate,
    counts: {
      scanned,
      currentlyIn,
      checkedOut,
      missing,
      onLeave,
      mia,
      justified,
      totalEmployees,
    },
    scannerOnline,
    lastSyncedIso: lastSyncedAt?.toISOString() ?? null,
    recordsToday,
    rows,
    canJustify: ALLOWED_ROLE_TYPES.has(roleType),
  };

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <AttendanceSummaryView data={data} />
    </AppShell>
  );
}
