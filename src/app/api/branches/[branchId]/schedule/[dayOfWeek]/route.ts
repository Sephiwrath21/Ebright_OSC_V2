import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseTimeToDate(timeStr: string): Date {
  const parts = timeStr.split(":");
  const h = parts.length > 0 ? Number(parts[0]) : 0;
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ branchId: string; dayOfWeek: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const { branchId, dayOfWeek } = await params;
  const bId = Number(branchId);
  if (isNaN(bId)) {
    return NextResponse.json({ success: false, error: "Invalid branchId" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { open_time, close_time, is_active, slots, positions } = body;

    const opDay = await prisma.branch_operating_day.findFirst({
      where: {
        branch_id: bId,
        day_of_week: dayOfWeek,
      },
    });

    if (!opDay) {
      return NextResponse.json({ success: false, error: "Operating day not found for this branch" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update operating day details
      await tx.branch_operating_day.update({
        where: { branch_operating_day_id: opDay.branch_operating_day_id },
        data: {
          open_time: parseTimeToDate(open_time),
          close_time: parseTimeToDate(close_time),
          is_active: is_active,
        },
      });

      // 2. Re-sync slots for this operating day
      await tx.slot.deleteMany({
        where: { branch_operating_day_id: opDay.branch_operating_day_id },
      });

      if (is_active && slots && slots.length > 0) {
        await tx.slot.createMany({
          data: slots.map((s: any, idx: number) => ({
            branch_operating_day_id: opDay.branch_operating_day_id,
            slot_start: s.slot_start,
            slot_end: s.slot_end,
            slot_type: s.slot_type,
            sequence_no: idx + 1,
          })).map((s: any) => ({
            ...s,
            slot_start: parseTimeToDate(s.slot_start),
            slot_end: parseTimeToDate(s.slot_end),
          }))
        });
      }

      // 3. Optional: Sync positions if provided
      if (positions) {
        await tx.branch_duty_position.deleteMany({
          where: { branch_id: bId },
        });
        if (positions.length > 0) {
          await tx.branch_duty_position.createMany({
            data: positions.map((p: any) => ({
              branch_id: bId,
              position_label: p.position_label,
              position_type: p.position_type,
            })),
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PUT /api/branches/:id/schedule/:dayOfWeek]", err);
    return NextResponse.json({ success: false, error: "Failed to update day schedule" }, { status: 500 });
  }
}
