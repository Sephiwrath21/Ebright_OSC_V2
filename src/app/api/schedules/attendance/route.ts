import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Manual attendance for the Manpower Schedule (Update mode). Keyed by
// (date, profile_id); the client keys its state by `${isoDate}::${nickname}`,
// so GET returns that shape and POST resolves nickname → profile_id (the same
// lookup /api/schedules uses).

type Status = "Present" | "Absent" | "Late";
const VALID: Status[] = ["Present", "Absent", "Late"];

// A day is locked only when a manual override row says so (superadmin lock).
// No automatic date-based locking.
async function isDayLocked(branchId: number, dateStr: string): Promise<boolean> {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const override = await prisma.manpower_attendance_day_lock.findUnique({
    where: { branch_id_date: { branch_id: branchId, date } },
    select: { locked: true },
  });
  return override?.locked ?? false;
}

// ─── GET: attendance for a branch's week ───
// ?branch=&startDate=&endDate=  →  { "<iso>::<nickname>": { status, locked } }
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchName = searchParams.get("branch");
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");

  if (!branchName || !startDateStr || !endDateStr) {
    return NextResponse.json({ success: false, error: "Missing branch/startDate/endDate" }, { status: 400 });
  }

  try {
    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    const startDate = new Date(`${startDateStr}T00:00:00Z`);
    const endDate = new Date(`${endDateStr}T00:00:00Z`);

    const rows = await prisma.manpower_schedule_attendance.findMany({
      where: {
        branch_id: branch.branch_id,
        date: { gte: startDate, lte: endDate },
      },
      include: { user_profile: { select: { nick_name: true, full_name: true } } },
    });

    const attendance: Record<string, { status: string }> = {};
    for (const r of rows) {
      const iso = r.date.toISOString().slice(0, 10);
      const name = r.user_profile.nick_name?.trim() || r.user_profile.full_name.trim();
      attendance[`${iso}::${name}`] = { status: r.status };
    }

    // Manual per-day lock overrides (present row = explicit lock/unlock for that
    // date; absent = fall back to the auto "past day is locked" rule on the client).
    const lockRows = await prisma.manpower_attendance_day_lock.findMany({
      where: { branch_id: branch.branch_id, date: { gte: startDate, lte: endDate } },
      select: { date: true, locked: true },
    });
    const dayLocks: Record<string, boolean> = {};
    for (const l of lockRows) dayLocks[l.date.toISOString().slice(0, 10)] = l.locked;

    return NextResponse.json({ success: true, attendance, dayLocks });
  } catch (err) {
    console.error("[GET /api/schedules/attendance]", err);
    return NextResponse.json({ success: false, error: "Failed to fetch attendance" }, { status: 500 });
  }
}

// ─── POST: save attendance for one date ───
// Body: { branch, date, entries: [{ name, status }] }  (a single { name, status }
// is also accepted for backward-compat).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const branchName = raw.branch as string;
    const dateStr = raw.date as string;
    const entries: { name: string; status: Status }[] = Array.isArray(raw.entries)
      ? raw.entries
      : raw.name
        ? [{ name: raw.name, status: raw.status }]
        : [];

    if (!branchName || !dateStr || entries.length === 0) {
      return NextResponse.json({ success: false, error: "Missing branch/date/entries" }, { status: 400 });
    }
    for (const e of entries) {
      if (!e?.name || !VALID.includes(e.status)) {
        return NextResponse.json({ success: false, error: "Invalid entry (name/status)" }, { status: 400 });
      }
    }

    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    // Reject if the day is locked (manual override, else auto once the day has
    // passed) — keeps the server consistent with the UI's read-only state.
    if (await isDayLocked(branch.branch_id, dateStr)) {
      return NextResponse.json({ success: false, error: "This day is locked." }, { status: 403 });
    }

    // Resolve every name → profile_id in one query (same lookup /api/schedules uses).
    const wanted = Array.from(new Set(entries.map(e => e.name.trim())));
    const profiles = await prisma.user_profile.findMany({
      where: { OR: [{ full_name: { in: wanted } }, { nick_name: { in: wanted } }] },
      select: { profile_id: true, full_name: true, nick_name: true },
    });
    const profileByName = new Map<string, number>();
    for (const p of profiles) {
      if (p.full_name) profileByName.set(p.full_name.toLowerCase(), p.profile_id);
      if (p.nick_name) profileByName.set(p.nick_name.toLowerCase(), p.profile_id);
    }

    const date = new Date(`${dateStr}T00:00:00Z`);

    await prisma.$transaction(
      entries.flatMap(e => {
        const profileId = profileByName.get(e.name.trim().toLowerCase());
        if (!profileId) return [];
        return [
          prisma.manpower_schedule_attendance.upsert({
            where: { date_profile_id: { date, profile_id: profileId } },
            update: { status: e.status, branch_id: branch.branch_id, updated_at: new Date() },
            create: { date, profile_id: profileId, branch_id: branch.branch_id, status: e.status },
          }),
        ];
      }),
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/schedules/attendance]", err);
    return NextResponse.json({ success: false, error: "Failed to save attendance" }, { status: 500 });
  }
}

// ─── PUT: lock / unlock a whole day ───
// Body: { branch, date, locked }  → upsert the per-day override.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }
  // Only superadmins may lock / unlock a day.
  const role = (session.user as { role?: string }).role ?? "";
  if (role.toLowerCase() !== "superadmin") {
    return NextResponse.json({ success: false, error: "Only a superadmin can lock or unlock a day." }, { status: 403 });
  }

  try {
    const raw = await req.json();
    const branchName = raw.branch as string;
    const dateStr = raw.date as string;
    const locked = raw.locked as boolean;

    if (!branchName || !dateStr || typeof locked !== "boolean") {
      return NextResponse.json({ success: false, error: "Missing branch/date/locked" }, { status: 400 });
    }

    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    const date = new Date(`${dateStr}T00:00:00Z`);
    await prisma.manpower_attendance_day_lock.upsert({
      where: { branch_id_date: { branch_id: branch.branch_id, date } },
      update: { locked, updated_at: new Date() },
      create: { branch_id: branch.branch_id, date, locked },
    });

    return NextResponse.json({ success: true, locked });
  } catch (err) {
    console.error("[PUT /api/schedules/attendance]", err);
    return NextResponse.json({ success: false, error: "Failed to update day lock" }, { status: 500 });
  }
}
