import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeField(d: Date): string {
  // Prisma returns @db.Time(6) as a Date object anchored to 1970-01-01 UTC
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function parseTimeStr(timeStr: string): Date {
  const parts = (timeStr || "00:00").split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchName = searchParams.get("branchName");

  if (!branchName) {
    return NextResponse.json({ success: false, error: "branchName is required" }, { status: 400 });
  }

  try {
    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });

    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    // Fetch operating days stored in database - NO auto-seeding here
    const operatingDays = await prisma.branch_operating_day.findMany({
      where: { branch_id: branch.branch_id },
      include: {
        slot: { orderBy: { sequence_no: "asc" } },
      },
      orderBy: { branch_operating_day_id: "asc" },
    });

    const positions = await prisma.branch_position.findMany({
      where:   { branch_id: branch.branch_id },
      orderBy: { display_order: "asc" },
    });

    const mappedDays = operatingDays.map((od) => ({
      branch_operating_day_id: od.branch_operating_day_id,
      day_of_week: od.day_of_week,
      open_time:   formatTimeField(od.open_time),
      close_time:  formatTimeField(od.close_time),
      is_active:   od.is_active,
      slots: od.slot.map((s) => ({
        slot_id:     s.slot_id,
        slot_start:  formatTimeField(s.slot_start),
        slot_end:    formatTimeField(s.slot_end),
        slot_type:   s.slot_type,   // raw DB value: "opening" | "coach" | "closing"
        sequence_no: s.sequence_no,
      })),
    }));

    return NextResponse.json({
      success: true,
      operatingDays: mappedDays,
      positions: positions.map((p) => ({
        position_id:    p.branch_position_id,
        position_label: p.position_label,
        position_type:  p.position_type,
      })),
    });
  } catch (err) {
    const msg    = err instanceof Error ? err.message : String(err);
    const detail = err instanceof Error ? (err.stack ?? "") : "";
    console.error("[GET /api/schedules/settings]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load settings", detail: `${msg} | ${detail}` },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const body          = await req.json();
    const branchName    = body.branchName    as string;
    const operatingDays = body.operatingDays as any[];

    if (!branchName) {
      return NextResponse.json({ success: false, error: "branchName is required" }, { status: 400 });
    }

    const branch = await prisma.branch.findFirst({
      where:  { branch_name: branchName },
      select: { branch_id: true },
    });

    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // Save provided operating days (can be a subset or just a single day)
      for (const od of operatingDays) {
        let dayId = od.branch_operating_day_id;

        if (!dayId) {
          // Check if a record already exists for this branch + day_of_week to prevent duplicates
          const existing = await tx.branch_operating_day.findUnique({
            where: {
              branch_id_day_of_week: {
                branch_id:   branch.branch_id,
                day_of_week: od.day_of_week,
              },
            },
          });

          if (existing) {
            await tx.branch_operating_day.update({
              where: { branch_operating_day_id: existing.branch_operating_day_id },
              data: {
                open_time:  parseTimeStr(od.open_time),
                close_time: parseTimeStr(od.close_time),
                is_active:  od.is_active,
              },
            });
            dayId = existing.branch_operating_day_id;
          } else {
            const created = await tx.branch_operating_day.create({
              data: {
                branch_id:   branch.branch_id,
                day_of_week: od.day_of_week,
                open_time:   parseTimeStr(od.open_time),
                close_time:  parseTimeStr(od.close_time),
                is_active:   od.is_active,
              },
            });
            dayId = created.branch_operating_day_id;
          }
        } else {
          await tx.branch_operating_day.update({
            where: { branch_operating_day_id: dayId },
            data: {
              open_time:  parseTimeStr(od.open_time),
              close_time: parseTimeStr(od.close_time),
              is_active:  od.is_active,
            },
          });
        }

        // Re-sync slots for this operating day: delete and recreate
        await tx.slot.deleteMany({
          where: { branch_operating_day_id: dayId },
        });

        if (od.is_active && Array.isArray(od.slots) && od.slots.length > 0) {
          await tx.slot.createMany({
            data: od.slots.map((s: any, idx: number) => ({
              branch_operating_day_id: dayId,
              slot_start:  parseTimeStr(s.slot_start),
              slot_end:    parseTimeStr(s.slot_end),
              slot_type:   s.slot_type,
              sequence_no: idx + 1,
            })),
          });
        }
      }

      // NOTE: duty positions are NOT managed here anymore. They are owned by
      // /api/schedules/positions (stable branch_position definitions + per-week
      // activation). The settings screen never sent positions, and the old
      // delete-all/recreate here would break manpower_schedule's FK. Removed.
    });

    // Fetch the final state of operating days to return to frontend
    const operatingDaysFinal = await prisma.branch_operating_day.findMany({
      where: { branch_id: branch.branch_id },
      include: {
        slot: { orderBy: { sequence_no: "asc" } },
      },
      orderBy: { branch_operating_day_id: "asc" },
    });

    const mappedDays = operatingDaysFinal.map((od) => ({
      branch_operating_day_id: od.branch_operating_day_id,
      day_of_week: od.day_of_week,
      open_time:   formatTimeField(od.open_time),
      close_time:  formatTimeField(od.close_time),
      is_active:   od.is_active,
      slots: od.slot.map((s) => ({
        slot_id:     s.slot_id,
        slot_start:  formatTimeField(s.slot_start),
        slot_end:    formatTimeField(s.slot_end),
        slot_type:   s.slot_type,
        sequence_no: s.sequence_no,
      })),
    }));

    const positionsFinal = await prisma.branch_position.findMany({
      where: { branch_id: branch.branch_id },
      orderBy: { display_order: "asc" },
    });

    return NextResponse.json({
      success: true,
      operatingDays: mappedDays,
      positions: positionsFinal.map((p) => ({
        position_id:    p.branch_position_id,
        position_label: p.position_label,
        position_type:  p.position_type,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/schedules/settings]", err);
    return NextResponse.json(
      { success: false, error: "Failed to save settings", detail: msg },
      { status: 500 }
    );
  }
}
