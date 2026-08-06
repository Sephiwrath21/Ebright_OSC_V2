import "server-only";
import { prisma } from "@/lib/prisma";
import { refreshAndReadAttendance } from "@/lib/attendance-all";
import {
  scheduleForDate,
  slotForDate,
  hasSchedule,
  getVersionsForEmployment,
  type WeeklySchedule,
  type DayKey,
  DAY_KEYS,
} from "@/lib/schedule-history";
import { getMalaysiaHoliday } from "@/lib/malaysiaHolidays";
import { mytDateOnly } from "@/lib/myt";

// ────────────────────────────────────────────────────────────────────────────
// Own-record attendance, sourced the same way as the Attendance Summary:
// raw Hikvision scans in hikvision_attendance_all (ebright_hrfs source DB),
// classified against the employee's schedule. Scoped to ONE user's employee_id.
//
// This replaces the old prisma.attendance path (a table that is stale/empty for
// most people) so the self-service dashboard shows the same numbers HR sees.
// ────────────────────────────────────────────────────────────────────────────

// Late = first scan strictly after scheduled start + this grace (matches Summary).
const LATE_GRACE_MINUTES = 1;
const OT_THRESHOLD_HOURS = 8;

export type SelfDayState =
  | "ontime"
  | "late"
  | "absent"
  | "today"
  | "upcoming"
  | "holiday"
  | "offday";

export interface SelfDayInfo {
  /** Scheduled slot for the day, or null when it's a non-working (off) day. */
  slot: { start: string; end: string } | null;
  holidayName: string | null;
  /** First scan of the day (MYT wall clock, stored as UTC fields). */
  checkIn: Date | null;
  /** Last scan when it's after the first (a real check-out), else null. */
  checkOut: Date | null;
  scanCount: number;
}

export interface SelfAttendance {
  empNo: string | null;
  /** Keyed by YYYY-MM-DD (MYT). Covers every date in the requested range. */
  days: Map<string, SelfDayInfo>;
}

// attendance_all clock_in/out are MYT wall-clock "HH:MM:SS". Combining with the
// day as "<day>T<time>Z" yields a Date whose UTC fields equal that wall clock,
// so getUTCHours()/getUTCMinutes() read the MYT time directly and (last − first)
// is a correct duration.
function mytWallDate(day: string, time: string | null): Date | null {
  if (!time) return null;
  const d = new Date(`${day}T${time}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clockMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function startMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
}

// Fallback schedule when an employment has no versioned/current schedule at all
// — mirrors the branch defaults the dashboard used before (HQ Tue–Sat, else
// Mon–Sat, 09:00–18:00). Keeps the week populated for unscheduled staff.
function defaultSchedule(branchCode: string | null): WeeklySchedule {
  const dows: DayKey[] =
    branchCode === "HQ"
      ? ["Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const out: WeeklySchedule = {};
  for (const d of dows) out[d] = { start: "09:00", end: "18:00" };
  return out;
}

function isoOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function* eachDateIso(fromIso: string, toIso: string): Generator<string> {
  const cur = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    yield isoOf(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

/** MYT calendar date (YYYY-MM-DD) of "now". */
export function mytTodayIso(): string {
  return isoOf(mytDateOnly());
}

/**
 * Build a day-by-day attendance picture for one user over [fromIso, toIso]
 * (inclusive), from Hikvision scans + their resolved schedule.
 */
export async function getSelfAttendance(
  userId: number,
  fromIso: string,
  toIso: string,
): Promise<SelfAttendance> {
  const employment = await prisma.employment.findFirst({
    where: { user_id: userId },
    orderBy: { employment_id: "desc" },
    select: {
      employment_id: true,
      employee_id: true,
      working_hours_json: true,
      branch: { select: { branch_code: true } },
    },
  });

  const empNo = employment?.employee_id?.trim() ?? null;
  const branchCode = employment?.branch?.branch_code ?? null;

  const versions = employment
    ? await getVersionsForEmployment(employment.employment_id)
    : [];
  const whJson = (employment?.working_hours_json as WeeklySchedule | null) ?? null;
  const def = defaultSchedule(branchCode);

  const slotFor = (dateIso: string): { start: string; end: string } | null => {
    let sched: WeeklySchedule | undefined;
    if (versions.length) sched = scheduleForDate(versions, dateIso);
    if (sched === undefined) sched = hasSchedule(whJson) ? (whJson as WeeklySchedule) : def;
    return slotForDate(sched, dateIso);
  };

  // Sync-on-view then read this employee's daily rows from attendance_all.
  const scanByDay = new Map<string, { checkIn: Date | null; checkOut: Date | null; count: number }>();
  if (empNo) {
    const rows = await refreshAndReadAttendance(fromIso, toIso, empNo);
    for (const r of rows) {
      const checkIn = mytWallDate(r.day, r.clock_in);
      const last = mytWallDate(r.day, r.clock_out) ?? checkIn;
      const checkOut =
        last && checkIn && last.getTime() > checkIn.getTime() ? last : null;
      scanByDay.set(r.day, { checkIn, checkOut, count: r.scan_count });
    }
  }

  const days = new Map<string, SelfDayInfo>();
  for (const dateIso of eachDateIso(fromIso, toIso)) {
    const scan = scanByDay.get(dateIso);
    days.set(dateIso, {
      slot: slotFor(dateIso),
      holidayName: getMalaysiaHoliday(dateIso),
      checkIn: scan?.checkIn ?? null,
      checkOut: scan?.checkOut ?? null,
      scanCount: scan?.count ?? 0,
    });
  }

  return { empNo, days };
}

/** Classify a single day. `todayIso` is the MYT calendar date of "now". */
export function classifySelfDay(
  info: SelfDayInfo,
  dateIso: string,
  todayIso: string,
): { state: SelfDayState; minutesLate?: number } {
  if (info.holidayName) return { state: "holiday" };
  if (!info.slot) return { state: "offday" };
  if (info.checkIn) {
    const mins = clockMinutes(info.checkIn) - startMinutes(info.slot.start);
    return mins > LATE_GRACE_MINUTES
      ? { state: "late", minutesLate: mins }
      : { state: "ontime" };
  }
  if (dateIso === todayIso) return { state: "today" };
  if (dateIso > todayIso) return { state: "upcoming" };
  return { state: "absent" };
}

/** Hours worked on a day (0 when there's no real check-in/out pair). */
export function hoursForDay(info: SelfDayInfo): number {
  if (info.checkIn && info.checkOut) {
    const ms = info.checkOut.getTime() - info.checkIn.getTime();
    if (ms > 0) return ms / 3_600_000;
  }
  return 0;
}

export function overtimeForDay(info: SelfDayInfo): number {
  const h = hoursForDay(info);
  return h > OT_THRESHOLD_HOURS ? h - OT_THRESHOLD_HOURS : 0;
}

// ── Justification helpers (used by the staff self-justify action) ────────────

export type AttendanceDayState = SelfDayState | "nonworking";

/** Classify one day for justification: only absent/late days may be justified. */
export async function classifyMyAttendanceDay(
  userId: number,
  dateIso: string,
): Promise<AttendanceDayState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "nonworking";
  const { days } = await getSelfAttendance(userId, dateIso, dateIso);
  const info = days.get(dateIso);
  if (!info) return "nonworking";
  const { state } = classifySelfDay(info, dateIso, mytTodayIso());
  return state === "offday" ? "nonworking" : state;
}

export function isJustifiableState(state: AttendanceDayState): boolean {
  return state === "absent" || state === "late";
}

export { DAY_KEYS };
