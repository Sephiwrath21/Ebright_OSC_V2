import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryEbrightHrfs } from "@/lib/ebright-hrfs";
import { ST_DEVICE_ID, remapStScan, stSourceFor } from "@/lib/scan-identity";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set([
  "superadmin", "ceo", "hr", "hod", "branch_manager", "admin", "super_admin",
]);

// Roles that see all branches; everyone else (BM) is scoped to their branch.
const ALL_BRANCH_ROLES = new Set([
  "superadmin", "super_admin", "ceo", "admin", "hr", "hod", "academy",
]);

interface ScanRow {
  person_id: string;
  name: string | null;
  device_name: string | null;
  device_id: string | null;
  event_time: Date;
}

interface AttendanceTodayRow {
  date: string;             // YYYY-MM-DD MYT
  empNo: string;
  empName: string | null;
  clockInTime: string;      // HH:MM:SS MYT
  clockOutTime: string | null;
  scannerLocation: "HQ" | "Subang Taipan";
}

// Apply the +8h convention we use everywhere else for HRFS event_time.
function mytHm(d: Date): string {
  const m = new Date(d.getTime() + 8 * 60 * 60_000);
  return `${String(m.getUTCHours()).padStart(2, "0")}:${String(m.getUTCMinutes()).padStart(2, "0")}:${String(m.getUTCSeconds()).padStart(2, "0")}`;
}
function mytDateOf(d: Date): string {
  const m = new Date(d.getTime() + 8 * 60 * 60_000);
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}-${String(m.getUTCDate()).padStart(2, "0")}`;
}
function todayMyt(): string {
  return mytDateOf(new Date());
}
function mytDayUtcBounds(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, -8, 0, 0));
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start, end };
}

function deviceToLocation(deviceId: string | null, deviceName: string | null): "HQ" | "Subang Taipan" {
  if (deviceId === ST_DEVICE_ID) return "Subang Taipan";
  const n = (deviceName ?? "").toLowerCase();
  if (n.includes("subang") || n.includes("taipan") || /\bst\b/.test(n)) {
    return "Subang Taipan";
  }
  return "HQ";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      role: { select: { role_type: true } },
      employment: {
        where: { status: "active" },
        take: 1,
        orderBy: { employment_id: "desc" },
        select: {
          employee_id: true,
          branch: { select: { branch_code: true } },
        },
      },
    },
  });
  const roleType = me?.role?.role_type?.toLowerCase() ?? "";
  if (!ALLOWED_ROLES.has(roleType)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Date param (defaults to today KL)
  const dateParam = new URL(req.url).searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayMyt();
  const { start, end } = mytDayUtcBounds(date);

  // Scoping: BM (or unscoped roles) need their allowed empNos. ALL_BRANCH_ROLES
  // see everyone; everyone else is filtered to their branch's BranchStaff.
  let allowedEmpNos: Set<string> | null = null;
  if (!ALL_BRANCH_ROLES.has(roleType)) {
    const branchCode = me?.employment[0]?.branch?.branch_code ?? null;
    if (!branchCode) {
      // Fail closed
      return NextResponse.json({ rows: [], date, scope: "empty" });
    }
    const bs = await queryEbrightHrfs<{ employee_id: string | null }>(
      `SELECT "employeeId" AS employee_id FROM public."BranchStaff"
        WHERE status = 'Active' AND branch = $1 AND "employeeId" IS NOT NULL`,
      [branchCode],
    );
    allowedEmpNos = new Set(bs.rows.map((r) => r.employee_id!).filter(Boolean));
  }

  // Pull raw scans for the day. Exclude null/empty/'0' person_id.
  const scansRes = await queryEbrightHrfs<ScanRow>(
    `SELECT person_id, name, device_name, device_id, event_time
       FROM public.hikvision_attendance_all
      WHERE event_time >= $1 AND event_time < $2
        AND person_id IS NOT NULL AND person_id <> '' AND person_id <> '0'
      ORDER BY event_time ASC`,
    [start.toISOString(), end.toISOString()],
  );

  // Branch-manager widening: also include source person_ids that REMAP TO
  // one of the allowed empNos (so we pick up ST scans whose source id lives
  // under a different person).
  let widenedAllowed: Set<string> | null = null;
  if (allowedEmpNos) {
    widenedAllowed = new Set(allowedEmpNos);
    for (const code of allowedEmpNos) {
      const source = stSourceFor(code);
      if (source) widenedAllowed.add(source);
    }
  }

  // Apply ST remap row-by-row, then group by (remappedPersonId | location).
  type Agg = {
    empNo: string;
    empName: string | null;
    location: "HQ" | "Subang Taipan";
    first: Date;
    last: Date;
  };
  const agg = new Map<string, Agg>();
  for (const r of scansRes.rows) {
    if (widenedAllowed && !widenedAllowed.has(r.person_id)) continue;
    const location = deviceToLocation(r.device_id, r.device_name);
    const remapped = remapStScan(r.device_id, r.person_id, r.name);
    const empNo = remapped.personId;
    const key = `${empNo}|${location}`;
    const existing = agg.get(key);
    const eventTime = r.event_time instanceof Date ? r.event_time : new Date(r.event_time);
    if (!existing) {
      agg.set(key, {
        empNo,
        empName: remapped.name,
        location,
        first: eventTime,
        last: eventTime,
      });
    } else {
      if (eventTime < existing.first) existing.first = eventTime;
      if (eventTime > existing.last) existing.last = eventTime;
      if (!existing.empName && remapped.name) existing.empName = remapped.name;
    }
  }

  // Post-remap allow-list: drop groups whose remapped empNo isn't in the
  // ORIGINAL allowed set (so an ST scan that remapped to a Subang Taipan staff
  // doesn't accidentally show up for a HQ branch manager).
  const rows: AttendanceTodayRow[] = [];
  for (const a of agg.values()) {
    if (allowedEmpNos && !allowedEmpNos.has(a.empNo)) continue;
    const sameInstant = a.first.getTime() === a.last.getTime();
    rows.push({
      date,
      empNo: a.empNo,
      empName: a.empName,
      clockInTime: mytHm(a.first),
      clockOutTime: sameInstant ? null : mytHm(a.last),
      scannerLocation: a.location,
    });
  }

  // Stable order: clock-in DESC (latest first) — matches the reference layout.
  rows.sort((x, y) => y.clockInTime.localeCompare(x.clockInTime));

  return NextResponse.json({ date, rows });
}
