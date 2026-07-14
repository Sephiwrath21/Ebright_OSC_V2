import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["superadmin", "ceo", "hr"]);

// Read-only diagnostic: for a given MYT date, compare what
// hikvision_attendance_all has on HRFS vs what the portal's Summary would
// show. Returns per-person rows + a summary of dropped scans, so we can
// nail down "data is wrong" complaints precisely.
//
// Usage:  /api/admin/hikvision-vs-portal?date=YYYY-MM-DD
//         (defaults to today MYT if no date)
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

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  // Today in MYT
  const now = new Date(Date.now() + 8 * 60 * 60_000);
  const todayMyt = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayMyt;

  const [y, m, d] = date.split("-").map(Number);
  // UTC window covering [MYT 00:00, MYT 24:00)
  const dayStart = new Date(Date.UTC(y, m - 1, d, -8, 0, 0));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);

  // 1) Raw hikvision events for the day (pre-translation)
  const raw = await queryEbrightHrfs<{
    id: number;
    person_id: string;
    name: string | null;
    event_time: Date;
    device_name: string | null;
  }>(
    `SELECT id, person_id, name, event_time, device_name
       FROM public.hikvision_attendance_all
      WHERE event_time >= $1 AND event_time < $2
      ORDER BY event_time ASC`,
    [dayStart.toISOString(), dayEnd.toISOString()],
  );

  // 2) ID-map translation table (wrong_id → true_id)
  const idMap = await queryEbrightHrfs<{ wrong_id: string; true_id: string; true_name: string | null }>(
    `SELECT wrong_id, true_id, true_name FROM public.hikvision_id_map`,
  );
  const wrongToTrue = new Map<string, string>();
  const trueNameByCode = new Map<string, string | null>();
  for (const m of idMap.rows) {
    wrongToTrue.set(m.wrong_id, m.true_id);
    trueNameByCode.set(m.true_id, m.true_name);
  }

  // 3) Local employment lookup (same matching the Summary uses)
  const emps = await prisma.employment.findMany({
    where: { status: "active", employee_id: { not: null } },
    select: {
      employee_id: true,
      user_id: true,
      users: { select: { user_profile: { select: { full_name: true } } } },
    },
  });
  const localByCode = new Map<string, { name: string | null }>();
  for (const e of emps) {
    if (e.employee_id) localByCode.set(e.employee_id, { name: e.users.user_profile?.full_name ?? null });
  }

  // 4) Aggregate hikvision per resolved person_id, just like the Summary does
  type Agg = { translatedCode: string; rawName: string | null; first: Date; last: Date; count: number; deviceNames: Set<string>; };
  const aggregated = new Map<string, Agg>();
  for (const r of raw.rows) {
    const translated = wrongToTrue.get(r.person_id) ?? r.person_id;
    const a = aggregated.get(translated);
    if (a) {
      if (r.event_time < a.first) a.first = r.event_time instanceof Date ? r.event_time : new Date(r.event_time);
      if (r.event_time > a.last) a.last = r.event_time instanceof Date ? r.event_time : new Date(r.event_time);
      a.count += 1;
      if (r.device_name) a.deviceNames.add(r.device_name);
    } else {
      aggregated.set(translated, {
        translatedCode: translated,
        rawName: r.name,
        first: r.event_time instanceof Date ? r.event_time : new Date(r.event_time),
        last: r.event_time instanceof Date ? r.event_time : new Date(r.event_time),
        count: 1,
        deviceNames: new Set(r.device_name ? [r.device_name] : []),
      });
    }
  }

  // 5) Classify each aggregated person
  const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  type Diff = {
    person_id: string;
    raw_hikvision_name: string | null;
    id_map_true_name: string | null;
    local_full_name: string | null;
    first_event_utc: string;
    first_event_myt: string;
    first_event_myt_date: string;
    last_event_utc: string;
    last_event_myt: string;
    scan_count: number;
    devices: string[];
    shown_on_portal: boolean;
    reason_dropped: string | null;
  };

  const diffs: Diff[] = [];
  let shownCount = 0;
  let droppedCount = 0;
  for (const [code, a] of aggregated) {
    const inLocal = localByCode.has(code);
    const localName = localByCode.get(code)?.name ?? null;
    const trueName = trueNameByCode.get(code) ?? null;
    let shown = false;
    let reason: string | null = null;
    if (!inLocal) {
      reason = "person_id has no matching employment.employee_id";
    } else if (!localName) {
      // Will still show, but with placeholder name
      shown = true;
      reason = "shown but user_profile.full_name is empty";
    } else {
      shown = true;
    }
    if (shown) shownCount += 1;
    else droppedCount += 1;
    diffs.push({
      person_id: code,
      raw_hikvision_name: a.rawName,
      id_map_true_name: trueName,
      local_full_name: localName,
      first_event_utc: a.first.toISOString(),
      first_event_myt: TIME_FMT.format(a.first),
      first_event_myt_date: DATE_FMT.format(a.first),
      last_event_utc: a.last.toISOString(),
      last_event_myt: TIME_FMT.format(a.last),
      scan_count: a.count,
      devices: [...a.deviceNames],
      shown_on_portal: shown,
      reason_dropped: reason,
    });
  }

  diffs.sort((a, b) => a.first_event_utc.localeCompare(b.first_event_utc));

  return NextResponse.json({
    date_myt: date,
    utc_window: { start: dayStart.toISOString(), end: dayEnd.toISOString() },
    raw_hikvision_event_count: raw.rows.length,
    distinct_persons: aggregated.size,
    shown_on_portal: shownCount,
    dropped_from_portal: droppedCount,
    rows: diffs,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
