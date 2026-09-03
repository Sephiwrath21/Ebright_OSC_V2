// Read-only bridge from Task Manager's My Week weekday sidebar to Manpower
// Scheduling's ACTUAL roster ("System A" — the root HRFS database's
// manpower_schedule table, completely separate from Task Manager's own
// ManpowerSchedule/ScheduleSlot models in manpower.ts, "System B"). Confirmed
// scope (2026-08-18): display only, no RunBlock/task creation; Coach + Branch
// Full Time Exec only (the caller decides that, not this function); ACTUAL
// only, never PLANNING; matched by email — the same cross-database bridge
// employeeQueries.ts already uses for Employee Folder. Inherits System A's
// existing write-path name-matching risk as-is (a stored manpower_schedule
// row is only ever created once a typed name resolves to a real profile_id,
// so anything we read here is already a resolved FK — the risk lives
// upstream of this function, in System A's own /api/schedules route).
import { prisma as hrfsPrisma } from "@/lib/prisma";
import type { MyManpowerActualSlot } from "../ui/types";
import { native } from "./core";

function formatTime(t: Date): string {
  const hours24 = t.getUTCHours();
  const minutes = t.getUTCMinutes();
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * The viewer's own ACTUAL manpower-schedule slot(s) for each of `dates`
 * (YYYY-MM-DD), keyed by the same date strings. Dates with no HRFS account,
 * no profile, or no ACTUAL assignment are simply absent from the map — this
 * is optional sidebar decoration, not a hard dependency, so it never throws
 * for those cases the way requireUserByEmail does for Task Manager's own
 * User lookup.
 */
export async function getMyManpowerSchedule(
  email: string,
  dates: string[],
): Promise<Map<string, MyManpowerActualSlot[]>> {
  return native(async () => {
    const hrfsUser = await hrfsPrisma.users.findUnique({
      where: { email: email.toLowerCase() },
      select: { user_profile: { select: { profile_id: true } } },
    });
    const profileId = hrfsUser?.user_profile?.profile_id;
    if (!profileId) return new Map();

    const rows = await hrfsPrisma.manpower_schedule.findMany({
      where: {
        profile_id: profileId,
        schedule_type: "actual",
        date: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) },
      },
      select: {
        date: true,
        branch_position: { select: { position_label: true } },
        slot: { select: { slot_start: true, slot_end: true } },
      },
    });

    const byDateRaw = new Map<string, { start: Date; slot: MyManpowerActualSlot }[]>();
    for (const row of rows) {
      const key = row.date.toISOString().slice(0, 10);
      const list = byDateRaw.get(key) ?? [];
      list.push({
        start: row.slot.slot_start,
        slot: {
          label: row.branch_position.position_label,
          start: formatTime(row.slot.slot_start),
          end: formatTime(row.slot.slot_end),
        },
      });
      byDateRaw.set(key, list);
    }

    const byDate = new Map<string, MyManpowerActualSlot[]>();
    for (const [key, list] of byDateRaw) {
      list.sort((a, b) => a.start.getTime() - b.start.getTime());
      byDate.set(
        key,
        list.map((x) => x.slot),
      );
    }
    return byDate;
  }, "getMyManpowerSchedule");
}
