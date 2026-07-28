import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Position type config ───
// Maps the frontend seat-count keys (coach/exec/training/star) to the
// authoritative position_type and the label/order scheme.
const COUNT_TYPES: { key: string; type: string; prefix: string; base: number }[] = [
  { key: "coach",    type: "coach",      prefix: "Coach",      base: 100 },
  { key: "exec",     type: "exec",       prefix: "Exec",       base: 200 },
  { key: "training", type: "training",   prefix: "Training",   base: 300 },
  { key: "star",     type: "star_coach", prefix: "Star Coach", base: 400 },
];

function labelFor(type: string, seat: number): string {
  const meta = COUNT_TYPES.find(t => t.type === type);
  return meta ? `${meta.prefix} ${seat}` : `${type} ${seat}`;
}
function orderFor(type: string, seat: number): number {
  const meta = COUNT_TYPES.find(t => t.type === type);
  return meta ? meta.base + seat : seat;
}
function typeToCountKey(type: string): string | null {
  return COUNT_TYPES.find(t => t.type === type)?.key ?? null;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Ensure a branch has its stable position DEFINITIONS. Seeds the default set
// (1 Manager, 3 Coach, 3 Exec) the first time a branch is used. Idempotent.
async function ensureDefinitions(branchId: number) {
  const data: {
    branch_id: number; position_type: string; seat_number: number;
    position_label: string; display_order: number;
  }[] = [
    { branch_id: branchId, position_type: "manager", seat_number: 1, position_label: "Manager on Duty", display_order: 0 },
  ];
  for (let i = 1; i <= 3; i++) {
    data.push({ branch_id: branchId, position_type: "coach", seat_number: i, position_label: `Coach ${i}`, display_order: 100 + i });
    data.push({ branch_id: branchId, position_type: "exec",  seat_number: i, position_label: `Exec ${i}`,  display_order: 200 + i });
  }
  await prisma.branch_position.createMany({ data, skipDuplicates: true });
}

// Ensure a single DATE's activation rows exist for every definition. When a
// date is opened for the first time, clone the activation from the SAME WEEKDAY
// of the previous week (date - 7 days) so per-day patterns carry forward; if
// there is none, activate by default.
async function ensureDayActivation(branchId: number, date: Date, defs: { branch_position_id: number }[]) {
  const existing = await prisma.branch_position_day.findMany({
    where: { date, branch_position: { branch_id: branchId } },
    select: { branch_position_id: true },
  });
  const existingIds = new Set(existing.map(r => r.branch_position_id));
  const missing = defs.filter(d => !existingIds.has(d.branch_position_id));
  if (missing.length === 0) return;

  const prevDate = new Date(date);
  prevDate.setUTCDate(prevDate.getUTCDate() - 7);
  const prevRows = await prisma.branch_position_day.findMany({
    where: { date: prevDate, branch_position: { branch_id: branchId } },
  });
  const activeMap: Record<number, boolean> = {};
  prevRows.forEach(r => { activeMap[r.branch_position_id] = r.is_active; });

  await prisma.branch_position_day.createMany({
    data: missing.map(d => ({
      branch_position_id: d.branch_position_id,
      date,
      is_active: activeMap[d.branch_position_id] ?? true,
    })),
    skipDuplicates: true,
  });
}

// ─── GET: per-day active seat counts for a branch's week ───
// ?branch=&weekStartDate=  → { positions, days: { <ISO date>: {coach,exec,training,star} } }
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchName = searchParams.get("branch");
  const weekStartDateStr = searchParams.get("weekStartDate");

  if (!branchName || !weekStartDateStr) {
    return NextResponse.json({ success: false, error: "Missing branch or weekStartDate" }, { status: 400 });
  }

  const weekStart = new Date(`${weekStartDateStr}T00:00:00Z`);

  try {
    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    // 1. Stable definitions (seed defaults on first use)
    let defs = await prisma.branch_position.findMany({
      where: { branch_id: branch.branch_id },
      orderBy: { display_order: "asc" },
    });
    if (defs.length === 0) {
      await ensureDefinitions(branch.branch_id);
      defs = await prisma.branch_position.findMany({
        where: { branch_id: branch.branch_id },
        orderBy: { display_order: "asc" },
      });
    }
    if (!defs.some(d => d.position_type === "manager")) {
      await prisma.branch_position.upsert({
        where: { branch_id_position_type_seat_number: { branch_id: branch.branch_id, position_type: "manager", seat_number: 1 } },
        update: {},
        create: { branch_id: branch.branch_id, position_type: "manager", seat_number: 1, position_label: "Manager on Duty", display_order: 0 },
      });
      defs = await prisma.branch_position.findMany({
        where: { branch_id: branch.branch_id },
        orderBy: { display_order: "asc" },
      });
    }

    // 2. The seven dates of the week (Mon..Sun) and their activation
    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + i);
      weekDates.push(d);
    }
    for (const d of weekDates) {
      await ensureDayActivation(branch.branch_id, d, defs);
    }

    const dayRows = await prisma.branch_position_day.findMany({
      where: { date: { in: weekDates }, branch_position: { branch_id: branch.branch_id } },
    });
    const defById = new Map(defs.map(d => [d.branch_position_id, d]));

    // 3. Per-date counts (active seats by type)
    const days: Record<string, { coach: number; exec: number; training: number; star: number }> = {};
    for (const d of weekDates) days[isoDate(d)] = { coach: 0, exec: 0, training: 0, star: 0 };
    for (const row of dayRows) {
      if (!row.is_active) continue;
      const def = defById.get(row.branch_position_id);
      if (!def) continue;
      const key = typeToCountKey(def.position_type);
      if (key) days[isoDate(row.date)][key as "coach" | "exec" | "training" | "star"]++;
    }

    return NextResponse.json({
      success: true,
      days,
      positions: defs.map(p => ({
        position_id: p.branch_position_id,
        label: p.position_label,
        type: p.position_type,
        seat_number: p.seat_number,
        display_order: p.display_order,
      })),
    });
  } catch (err) {
    console.error("[GET /api/schedules/positions]", err);
    return NextResponse.json({ success: false, error: "Failed to fetch positions" }, { status: 500 });
  }
}

// ─── POST: set seat counts for a SINGLE date ───
// Body: { branch, date, counts: { coach, exec, training, star } }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const branchName = raw.branch as string;
    const dateStr = raw.date as string;
    const counts = raw.counts as Record<string, number>;

    if (!branchName || !dateStr || !counts) {
      return NextResponse.json({ success: false, error: "Missing branch, date, or counts" }, { status: 400 });
    }

    const date = new Date(`${dateStr}T00:00:00Z`);

    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    // Manager is always present + active for the date.
    const mgr = await prisma.branch_position.upsert({
      where: { branch_id_position_type_seat_number: { branch_id: branch.branch_id, position_type: "manager", seat_number: 1 } },
      update: {},
      create: { branch_id: branch.branch_id, position_type: "manager", seat_number: 1, position_label: "Manager on Duty", display_order: 0 },
    });
    await prisma.branch_position_day.upsert({
      where: { branch_position_id_date: { branch_position_id: mgr.branch_position_id, date } },
      update: { is_active: true },
      create: { branch_position_id: mgr.branch_position_id, date, is_active: true },
    });

    for (const { type } of COUNT_TYPES) {
      const key = COUNT_TYPES.find(t => t.type === type)!.key;
      const desired = Math.max(0, Math.floor(Number(counts[key] ?? 0)));

      // Ensure definitions exist for seats 1..desired.
      for (let seat = 1; seat <= desired; seat++) {
        await prisma.branch_position.upsert({
          where: { branch_id_position_type_seat_number: { branch_id: branch.branch_id, position_type: type, seat_number: seat } },
          update: {},
          create: {
            branch_id: branch.branch_id,
            position_type: type,
            seat_number: seat,
            position_label: labelFor(type, seat),
            display_order: orderFor(type, seat),
          },
        });
      }

      // Activate seats 1..desired for THIS date, deactivate the rest.
      const typeDefs = await prisma.branch_position.findMany({
        where: { branch_id: branch.branch_id, position_type: type },
        orderBy: { seat_number: "asc" },
      });
      for (const d of typeDefs) {
        const active = d.seat_number <= desired;
        await prisma.branch_position_day.upsert({
          where: { branch_position_id_date: { branch_position_id: d.branch_position_id, date } },
          update: { is_active: active },
          create: { branch_position_id: d.branch_position_id, date, is_active: active },
        });
      }
    }

    // Return this date's resulting counts.
    const defs = await prisma.branch_position.findMany({ where: { branch_id: branch.branch_id } });
    const activeRows = await prisma.branch_position_day.findMany({
      where: { date, is_active: true, branch_position: { branch_id: branch.branch_id } },
    });
    const defById = new Map(defs.map(d => [d.branch_position_id, d]));
    const updatedCounts: Record<string, number> = { coach: 0, exec: 0, training: 0, star: 0 };
    for (const row of activeRows) {
      const def = defById.get(row.branch_position_id);
      if (!def) continue;
      const key = typeToCountKey(def.position_type);
      if (key) updatedCounts[key]++;
    }

    return NextResponse.json({ success: true, date: dateStr, counts: updatedCounts });
  } catch (err) {
    console.error("[POST /api/schedules/positions]", err);
    return NextResponse.json({ success: false, error: "Failed to update positions" }, { status: 500 });
  }
}
