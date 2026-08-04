import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getTimeSlotsForDay,
  getWorkingDaysForBranch,
  COLUMNS,
} from "@/lib/manpowerUtils";

function formatDateToTimeStr(d: Date): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

const ABBREV_TO_DAY: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function parseSingleTime(t: string) {
  const clean = t.toUpperCase().replace(/\s+/g, "");
  const isPM = clean.includes("PM");
  const timePart = clean.replace("AM", "").replace("PM", "");
  const sep = timePart.includes(".") ? "." : ":";
  const parts = timePart.split(sep);
  if (parts.length === 0) return null;
  let h = Number(parts[0]);
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  if (isPM && h < 12) h += 12;
  if (!isPM && h === 12) h = 0;
  return { h, m };
}

function parseTimeToDate(timeStr: string): Date {
  const parsed = parseSingleTime(timeStr);
  if (!parsed) return new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
  return new Date(Date.UTC(1970, 0, 1, parsed.h, parsed.m, 0));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ branchId: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  const { branchId } = await params;
  const bId = Number(branchId);
  if (isNaN(bId)) {
    return NextResponse.json({ success: false, error: "Invalid branchId" }, { status: 400 });
  }

  try {
    const branch = await prisma.branch.findUnique({
      where: { branch_id: bId },
      select: { branch_name: true }
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    // Auto-seed operating days & slots if they don't exist
    const daysCount = await prisma.branch_operating_day.count({ where: { branch_id: bId } });
    if (daysCount === 0) {
      const workingDays = getWorkingDaysForBranch(branch.branch_name);
      const allWeekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      
      for (const abbrev of allWeekDays) {
        const fullDayName = ABBREV_TO_DAY[abbrev] || abbrev;
        const isActive = workingDays.includes(fullDayName);
        
        const slotsForDay = getTimeSlotsForDay(fullDayName, branch.branch_name);
        let openTimeStr = "09:00 AM";
        let closeTimeStr = "10:00 PM";
        if (slotsForDay.length > 0) {
          const firstParts = slotsForDay[0].split(/[-–—]/).map(s => s.trim());
          const lastParts = slotsForDay[slotsForDay.length - 1].split(/[-–—]/).map(s => s.trim());
          if (firstParts.length > 0) openTimeStr = firstParts[0];
          if (lastParts.length > 1) closeTimeStr = lastParts[1];
        }
        
        const opDay = await prisma.branch_operating_day.create({
          data: {
            branch_id: bId,
            day_of_week: abbrev,
            open_time: parseTimeToDate(openTimeStr),
            close_time: parseTimeToDate(closeTimeStr),
            is_active: isActive,
          },
        });

        if (slotsForDay.length > 0) {
          const slotData = slotsForDay.map((wireSlot, idx) => {
            const parts = wireSlot.split(/[-–—]/).map(s => s.trim());
            const startStr = parts[0];
            const endStr = parts[1] || parts[0];
            
            let slotType = "coach";
            if (idx === 0) slotType = "opening";
            else if (idx === slotsForDay.length - 1) slotType = "closing";

            return {
              branch_operating_day_id: opDay.branch_operating_day_id,
              slot_start: parseTimeToDate(startStr),
              slot_end: parseTimeToDate(endStr),
              slot_type: slotType,
              sequence_no: idx + 1,
            };
          });
          await prisma.slot.createMany({ data: slotData });
        }
      }
    }

    // Auto-seed positions if they don't exist
    const posCount = await prisma.branch_duty_position.count({ where: { branch_id: bId } });
    if (posCount === 0) {
      const defaultPositions = [
        { label: "Manager on Duty", type: "manager" },
        ...COLUMNS.map((col, idx) => ({
          label: col.label,
          type: col.type,
        })),
      ];
      await prisma.branch_duty_position.createMany({
        data: defaultPositions.map(p => ({
          branch_id: bId,
          week_start_date: new Date(),
          position_label: p.label,
          position_type: p.type,
        })),
      });
    }

    const operatingDays = await prisma.branch_operating_day.findMany({
      where: { branch_id: bId },
      include: {
        slot: {
          orderBy: { sequence_no: "asc" }
        }
      },
      orderBy: {
        branch_operating_day_id: "asc"
      }
    });

    const positions = await prisma.branch_duty_position.findMany({
      where: { branch_id: bId },
      orderBy: { position_id: "asc" }
    });

    const mappedDays = operatingDays.map(od => ({
      branch_operating_day_id: od.branch_operating_day_id,
      day_of_week: od.day_of_week,
      open_time: formatDateToTimeStr(od.open_time),
      close_time: formatDateToTimeStr(od.close_time),
      is_active: od.is_active,
      slots: od.slot.map(s => ({
        slot_id: s.slot_id,
        slot_start: formatDateToTimeStr(s.slot_start),
        slot_end: formatDateToTimeStr(s.slot_end),
        slot_type: s.slot_type,
        sequence_no: s.sequence_no
      }))
    }));

    return NextResponse.json({
      success: true,
      operatingDays: mappedDays,
      positions: positions.map(p => ({
        position_id: p.position_id,
        position_label: p.position_label,
        position_type: p.position_type
      }))
    });
  } catch (err: any) {
    console.error("[GET /api/branches/:id/schedule]", err);
    return NextResponse.json({ success: false, error: err.message || "Failed to load branch schedule" }, { status: 500 });
  }
}
