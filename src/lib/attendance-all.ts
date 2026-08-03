import "server-only";
import { prisma } from "@/lib/prisma";
import { syncAttendance } from "@/lib/sync-attendance";

// Reader for the normalized attendance_all table (portal DB). This is the
// single attendance source for v2 — Summary, Report and the self-service
// dashboard all read here. Freshness is "sync on view": callers pull the range
// from the Hikvision log into attendance_all first, then read it back.

export interface AttendanceAllRow {
  emp_no: string;
  day: string; // YYYY-MM-DD (MYT)
  clock_in: string | null; // HH:MM:SS (MYT wall clock)
  clock_out: string | null; // HH:MM:SS (MYT wall clock)
  scan_count: number;
  device_name: string | null; // device of the earliest scan (for branch detection)
  synced_at: string | null; // ISO — when this row was last materialized
}

/**
 * Pull [fromIso, toIso] from the Hikvision log into attendance_all, then read
 * it back. The sync is best-effort — if the source is unreachable we still
 * return whatever is already materialized rather than failing the page.
 */
export async function refreshAndReadAttendance(
  fromIso: string,
  toIso: string,
  empNo?: string,
): Promise<AttendanceAllRow[]> {
  try {
    await syncAttendance({ since: fromIso, until: toIso });
  } catch {
    // fall through and read whatever's there
  }
  return readAttendance(fromIso, toIso, empNo);
}

/** Read attendance_all for a date range (optionally one employee), no sync. */
export async function readAttendance(
  fromIso: string,
  toIso: string,
  empNo?: string,
): Promise<AttendanceAllRow[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      emp_no: string;
      day: string;
      clock_in: string | null;
      clock_out: string | null;
      scan_count: number | bigint | null;
      device_name: string | null;
      synced_at: string | null;
    }>
  >(
    `SELECT employee_id AS emp_no,
            to_char(date, 'YYYY-MM-DD') AS day,
            to_char(clock_in_time,  'HH24:MI:SS') AS clock_in,
            to_char(clock_out_time, 'HH24:MI:SS') AS clock_out,
            COALESCE(scan_count, 0) AS scan_count,
            device_name,
            to_char(synced_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS synced_at
       FROM attendance_all
      WHERE date >= $1::date AND date <= $2::date${empNo ? " AND employee_id = $3" : ""}`,
    ...(empNo ? [fromIso, toIso, empNo] : [fromIso, toIso]),
  );

  return rows.map((r) => ({
    emp_no: r.emp_no,
    day: r.day,
    clock_in: r.clock_in,
    clock_out: r.clock_out,
    scan_count: Number(r.scan_count ?? 0),
    device_name: r.device_name,
    synced_at: r.synced_at,
  }));
}
