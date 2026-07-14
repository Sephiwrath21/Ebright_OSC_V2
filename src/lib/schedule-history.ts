import "server-only";
import { prisma } from "@/lib/prisma";

// Weekly schedule lives on employment.working_hours_json (jsonb).
// Same shape is used for every versioned snapshot in
// employment_schedule_version.
export type DayKey = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
export const DAY_KEYS: DayKey[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DaySchedule = { start: string; end: string } | null;
export type WeeklySchedule = Partial<Record<DayKey, DaySchedule>>;

export interface ScheduleVersion {
  effectiveFrom: string; // YYYY-MM-DD
  schedule: WeeklySchedule;
}

/**
 * Return the schedule with the GREATEST effectiveFrom that is <= dateStr.
 * Returns undefined if dateStr is before the earliest version (caller should
 * then render NO late/early badge for that day — the schedule didn't exist).
 *
 * `versions` must be sorted oldest-first by effectiveFrom.
 */
export function scheduleForDate(
  versions: ScheduleVersion[],
  dateStr: string,
): WeeklySchedule | undefined {
  let result: WeeklySchedule | undefined;
  for (const v of versions) {
    if (v.effectiveFrom <= dateStr) result = v.schedule;
    else break;
  }
  return result;
}

/** True if the weekly schedule has ANY non-null day. */
export function hasSchedule(schedule: WeeklySchedule | null | undefined): boolean {
  if (!schedule) return false;
  for (const k of DAY_KEYS) {
    if (schedule[k]) return true;
  }
  return false;
}

/** The slot (or null) for the dayKey derived from `dateStr` (MYT calendar). */
export function slotForDate(
  schedule: WeeklySchedule | null | undefined,
  dateStr: string,
): DaySchedule {
  if (!schedule) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use UTC midday to avoid any TZ slop when extracting weekday name.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dayKey = DAY_KEYS[dt.getUTCDay()];
  return schedule[dayKey] ?? null;
}

/** Monday-of-the-week (MYT) for the given YYYY-MM-DD — UI default for "Effective from". */
export function mondayOfWeekMyt(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(dt.getTime() + delta * 86_400_000);
  return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, "0")}-${String(mon.getUTCDate()).padStart(2, "0")}`;
}

function dateToIso(d: Date): string {
  // Use UTC because the column is DATE; Prisma returns a UTC midnight Date.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** All versions for one employment, oldest-first. */
export async function getVersionsForEmployment(
  employmentId: number,
): Promise<ScheduleVersion[]> {
  const rows = await prisma.employment_schedule_version.findMany({
    where: { employment_id: employmentId },
    orderBy: { effective_from: "asc" },
    select: { effective_from: true, schedule: true },
  });
  return rows.map((r) => ({
    effectiveFrom: dateToIso(r.effective_from),
    schedule: r.schedule as WeeklySchedule,
  }));
}

/**
 * Resolved schedules for every employment that has history, keyed by
 * employment_id.
 * - value = schedule object → use it for that date
 * - value = null            → has history but no version covers `dateStr`
 *                             (render WITHOUT late/early — schedule wasn't set yet)
 * - key absent              → no history at all → caller falls back to current
 *                             employment.working_hours_json
 */
export async function getResolvedSchedulesForDate(
  dateStr: string,
): Promise<Record<number, WeeklySchedule | null>> {
  const target = new Date(dateStr + "T00:00:00Z");

  // Fetch every row up to and including the target date, plus every staff
  // that has any history rows AT ALL (so we can return null for those whose
  // earliest version is in the future).
  const [covering, allHistoryIds] = await Promise.all([
    prisma.employment_schedule_version.findMany({
      where: { effective_from: { lte: target } },
      orderBy: [{ employment_id: "asc" }, { effective_from: "desc" }],
      select: { employment_id: true, effective_from: true, schedule: true },
    }),
    prisma.employment_schedule_version.findMany({
      distinct: ["employment_id"],
      select: { employment_id: true },
    }),
  ]);

  const out: Record<number, WeeklySchedule | null> = {};

  // covering is sorted by employment_id, effective_from DESC — the first
  // row per employment is the latest version <= target.
  let lastEmploymentId: number | null = null;
  for (const row of covering) {
    if (row.employment_id === lastEmploymentId) continue;
    out[row.employment_id] = row.schedule as WeeklySchedule;
    lastEmploymentId = row.employment_id;
  }

  // Mark "has history but no version covers this date" with null.
  for (const r of allHistoryIds) {
    if (!(r.employment_id in out)) out[r.employment_id] = null;
  }

  return out;
}

/**
 * Upsert a versioned schedule for one employment AND keep
 * employment.working_hours_json in sync as the "current" cache.
 */
export async function upsertScheduleVersion(args: {
  employmentId: number;
  effectiveFrom: string;
  schedule: WeeklySchedule;
}): Promise<void> {
  const { employmentId, effectiveFrom, schedule } = args;
  const effDate = new Date(effectiveFrom + "T00:00:00Z");

  await prisma.$transaction([
    prisma.employment_schedule_version.upsert({
      where: {
        employment_id_effective_from: {
          employment_id: employmentId,
          effective_from: effDate,
        },
      },
      create: {
        employment_id: employmentId,
        effective_from: effDate,
        schedule: schedule as never,
      },
      update: { schedule: schedule as never },
    }),
    prisma.employment.update({
      where: { employment_id: employmentId },
      data: { working_hours_json: schedule as never },
    }),
  ]);
}
