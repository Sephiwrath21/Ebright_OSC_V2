import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { remapStScan, stSourceFor } from "@/lib/scan-identity";

export const dynamic = "force-dynamic";

// GET /api/attendance-logs?empNo=…&month=…&year=…
// (or)  &staffName=…   (fallback when empNo not known)
//
// Returns per-calendar-day rows for a single employee within the month:
//   { date: "YYYY-MM-DD", checkIn: "HH:MM:SS" | null, checkOut: "HH:MM:SS" | null, scanCount }
//
// SAME source as /api/attendance-today so Summary and Report agree on times.
// ST remap is applied so the Subang Taipan empNos pull their ST scans (which
// physically sit under the HQ source id), and a HQ empNo's ST scans are
// excluded from the HQ totals.

interface RawScan {
  person_id: string;
  name: string | null;
  device_id: string | null;
  kl_date: string;       // YYYY-MM-DD (event_time + 8h)
  kl_time: string;       // HH:MM:SS  (event_time + 8h)
  event_time: Date;
}

interface DayRow {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  scanCount: number;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const empNo = url.searchParams.get("empNo")?.trim() || null;
  const staffName = url.searchParams.get("staffName")?.trim() || null;
  const monthStr = url.searchParams.get("month");
  const yearStr = url.searchParams.get("year");

  if (!empNo && !staffName) {
    return NextResponse.json({ error: "Provide empNo or staffName" }, { status: 400 });
  }
  const month = Number(monthStr);
  const year = Number(yearStr);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month (1-12)" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  // Month UTC bounds covering [day-1 00:00 KL, next-month-day-1 00:00 KL).
  const start = new Date(Date.UTC(year, month - 1, 1, -8, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, -8, 0, 0));

  // ID widening for ST remap: include source person_ids whose ST scans
  // remap to the requested empNo.
  const personIdFilter: string[] = [];
  if (empNo) {
    personIdFilter.push(empNo);
    const stSource = stSourceFor(empNo);
    if (stSource) personIdFilter.push(stSource);
  }

  // Build query — supports both empNo (with ST widening) and staffName.
  const whereClauses: string[] = [
    "event_time >= $1",
    "event_time <  $2",
  ];
  const params: unknown[] = [start.toISOString(), end.toISOString()];
  if (personIdFilter.length > 0) {
    params.push(personIdFilter);
    whereClauses.push(`person_id = ANY($${params.length}::text[])`);
  } else if (staffName) {
    params.push(`%${staffName}%`);
    whereClauses.push(`name ILIKE $${params.length}`);
  }

  // Apply +8h conversion at the SQL layer so the date/time strings are in KL.
  const res = await queryEbrightHrfs<RawScan>(
    `SELECT person_id, name, device_id,
            to_char(event_time + INTERVAL '8 hours', 'YYYY-MM-DD') AS kl_date,
            to_char(event_time + INTERVAL '8 hours', 'HH24:MI:SS') AS kl_time,
            event_time
       FROM public.hikvision_attendance_all
      WHERE ${whereClauses.join(" AND ")}
        AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'
      ORDER BY event_time ASC`,
    params,
  );

  // ST remap + filter to the requested empNo (post-remap).
  const dayMap = new Map<string, { first: string; last: string; count: number }>();
  for (const row of res.rows) {
    const remapped = remapStScan(row.device_id, row.person_id, row.name);
    if (empNo && remapped.personId !== empNo) continue;
    const existing = dayMap.get(row.kl_date);
    if (!existing) {
      dayMap.set(row.kl_date, { first: row.kl_time, last: row.kl_time, count: 1 });
    } else {
      if (row.kl_time < existing.first) existing.first = row.kl_time;
      if (row.kl_time > existing.last) existing.last = row.kl_time;
      existing.count += 1;
    }
  }

  const rows: DayRow[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, info]) => ({
      date,
      checkIn: info.first,
      checkOut: info.first === info.last ? null : info.last,
      scanCount: info.count,
    }));

  return NextResponse.json({ empNo, staffName, year, month, rows });
}
