import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface ScheduleWire {
  id: string;
  branch: string;
  startDate: string;
  endDate: string;
  selections: Record<string, string>;
  notes: Record<string, string>;
  originalSelections?: Record<string, string>;
  originalNotes?: Record<string, string>;
  status?: string;
  originalAuthor?: string;
}

// ─── Helpers ───

const DAYS_LIST = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_TO_ABBREV: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};
const ABBREV_TO_DAY: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function formatSlotTime(start: Date, end: Date): string {
  const fmt = (d: Date) => {
    const hours = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMinutes = String(minutes).padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };
  return `${fmt(start)} - ${fmt(end)}`;
}

function normalizePositionToColId(label: string): string {
  const clean = label.toLowerCase().replace(/\s+/g, "");
  if (clean.includes("manager")) return "MANAGER";
  if (clean.startsWith("starcoach")) {
    return clean.replace("starcoach", "star");
  }
  return clean;
}

function normalizeColIdToLabel(colId: string): string {
  if (colId === "MANAGER") return "Manager on Duty";
  if (colId.startsWith("star")) {
    const num = colId.replace("star", "");
    return `Star Coach ${num}`;
  }
  if (colId.startsWith("training")) {
    const num = colId.replace("training", "");
    return `Training ${num}`;
  }
  const match = colId.match(/^([a-zA-Z]+)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = match[2];
    return `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${num}`;
  }
  return colId;
}

// Clone-on-open: the first time the 'actual' schedule is viewed for a given
// date, mirror that date's 'planning' rows into 'actual' so the Actual table
// initially matches Planning exactly. Dates that already have any 'actual'
// rows are left untouched (an editor may have already adjusted them).
async function cloneActualFromPlanning(branchId: number, startDate: Date, endDate: Date) {
  for (
    const date = new Date(startDate);
    date.getTime() <= endDate.getTime();
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const currentDate = new Date(date);

    const existingActualCount = await prisma.manpower_schedule.count({
      where: {
        date: currentDate,
        schedule_type: "actual",
        slot: { branch_operating_day: { branch_id: branchId } },
      },
    });
    if (existingActualCount > 0) continue;

    const planningRows = await prisma.manpower_schedule.findMany({
      where: {
        date: currentDate,
        schedule_type: "planning",
        slot: { branch_operating_day: { branch_id: branchId } },
      },
    });
    if (planningRows.length === 0) continue;

    await prisma.manpower_schedule.createMany({
      data: planningRows.map(r => ({
        date: r.date,
        slot_id: r.slot_id,
        position_id: r.position_id,
        profile_id: r.profile_id,
        schedule_type: "actual",
      })),
    });
  }
}

// ─── API Methods ───

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: "Unauthorised" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const branchName = searchParams.get("branch");
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");
  const scheduleType = searchParams.get("scheduleType") || "actual"; // 'planning' | 'actual'

  try {
    if (branchName && startDateStr && endDateStr) {
      // ─── Query Single Schedule Detail ───
      const branch = await prisma.branch.findFirst({
        where: { branch_name: branchName },
        select: { branch_id: true },
      });
      if (!branch) {
        return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
      }

      const startDate = new Date(`${startDateStr}T00:00:00Z`);
      const endDate = new Date(`${endDateStr}T00:00:00Z`);

      if (scheduleType === "actual") {
        await cloneActualFromPlanning(branch.branch_id, startDate, endDate);
      }

      const rows = await prisma.manpower_schedule.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          schedule_type: scheduleType,
          slot: {
            branch_operating_day: { branch_id: branch.branch_id }
          }
        },
        include: {
          slot: {
            include: {
              branch_operating_day: true
            }
          },
          branch_duty_position: true,
          user_profile: true,
        }
      });

      const selections: Record<string, string> = {};
      let maxUpdatedAt = new Date(0);

      rows.forEach(r => {
        const dayName = DAYS_LIST[r.date.getUTCDay()];
        const slotText = formatSlotTime(r.slot.slot_start, r.slot.slot_end);
        const colId = normalizePositionToColId(r.branch_duty_position.position_label);
        const selectionKey = `${dayName}-${slotText}-${colId}`;
        selections[selectionKey] = r.user_profile.nick_name || r.user_profile.full_name;
        
        if (r.updated_at && r.updated_at.getTime() > maxUpdatedAt.getTime()) {
          maxUpdatedAt = r.updated_at;
        }
      });

      // Get status — only meaningful for the 'actual' schedule; planning is never archived
      let status = "draft";
      let changedSinceArchive = false;
      if (scheduleType === "actual") {
        const periodStatus = await prisma.schedule_period_status.findUnique({
          where: {
            branch_id_period_start_period_end: {
              branch_id: branch.branch_id,
              period_start: startDate,
              period_end: endDate,
            }
          }
        });

        status = periodStatus?.status ?? "draft";
        const archivedAt = periodStatus?.archived_at;
        changedSinceArchive = !!(status === "archived" && archivedAt && maxUpdatedAt.getTime() > archivedAt.getTime());
      }

      return NextResponse.json({
        success: true,
        schedule: {
          id: `${branchName}_${startDateStr}`,
          branch: branchName,
          startDate: startDateStr,
          endDate: endDateStr,
          selections,
          notes: {},
          status: status === "archived" ? "Finalized" : "Updated", // maps to existing frontend
          periodStatus: status, // raw 'draft' | 'archived'
          changedSinceArchive: !!changedSinceArchive,
        }
      });
    }

    // ─── Query Listing (default) ───
    const rows = await prisma.manpower_schedule.findMany({
      include: {
        slot: {
          include: {
            branch_operating_day: {
              include: {
                branch: { select: { branch_name: true, branch_id: true } },
              },
            },
          },
        },
        branch_duty_position: true,
        user_profile: true,
      },
      orderBy: { date: "desc" },
    });

    const groups = new Map<string, {
      branchName: string;
      mondayISO: string;
      sundayISO: string;
      selections: Record<string, string>;
    }>();

    rows.forEach(r => {
      const branchName = r.slot.branch_operating_day.branch.branch_name;
      const rowDate = r.date;
      
      const dayOfWeek = rowDate.getUTCDay(); // 0 is Sunday, 1 is Monday...
      const diff = rowDate.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(rowDate.getUTCFullYear(), rowDate.getUTCMonth(), diff));
      const mondayISO = monday.toISOString().slice(0, 10);

      const sunday = new Date(monday);
      sunday.setUTCDate(sunday.getUTCDate() + 6);
      const sundayISO = sunday.toISOString().slice(0, 10);

      const key = `${branchName}:::${mondayISO}`;
      if (!groups.has(key)) {
        groups.set(key, {
          branchName,
          mondayISO,
          sundayISO,
          selections: {},
        });
      }

      const g = groups.get(key)!;
      const dayName = DAYS_LIST[rowDate.getUTCDay()];
      const slotText = formatSlotTime(r.slot.slot_start, r.slot.slot_end);
      const colId = normalizePositionToColId(r.branch_duty_position.position_label);
      
      const selectionKey = `${dayName}-${slotText}-${colId}`;
      g.selections[selectionKey] = r.user_profile.nick_name || r.user_profile.full_name;
    });

    // Get archived period statuses to show accurate lock status
    const periodStatuses = await prisma.schedule_period_status.findMany({
      include: { branch: true }
    });

    const schedules = Array.from(groups.values()).map(g => {
      const isArchived = periodStatuses.some(
        ps =>
          ps.branch.branch_name === g.branchName &&
          ps.period_start.toISOString().slice(0, 10) === g.mondayISO &&
          ps.status === "archived"
      );
      return {
        id: `${g.branchName}_${g.mondayISO}`,
        branch: g.branchName,
        startDate: g.mondayISO,
        endDate: g.sundayISO,
        selections: g.selections,
        notes: {},
        status: isArchived ? "Finalized" : "Updated",
        submittedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, schedules });
  } catch (err) {
    console.error("[GET /api/schedules]", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch schedules" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: "Unauthorised" },
      { status: 401 },
    );
  }

  try {
    const raw = await req.json();
    const branchName = raw.branch as string;
    const startDateStr = raw.startDate as string;
    const endDateStr = raw.endDate as string;
    const saveDateStr = raw.date as string | undefined; // optional single date draft
    const selections = (raw.selections ?? {}) as Record<string, string>;
    const scheduleType = (raw.scheduleType ?? "actual") as "planning" | "actual";

    if (!branchName || !startDateStr || !endDateStr) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    const startDate = new Date(`${startDateStr}T00:00:00Z`);
    const endDate = new Date(`${endDateStr}T00:00:00Z`);
    const saveDate = saveDateStr ? new Date(`${saveDateStr}T00:00:00Z`) : null;

    // Fetch slots and active positions from the database for mapping
    const slots = await prisma.slot.findMany({
      where: {
        branch_operating_day: { branch_id: branch.branch_id }
      },
      include: {
        branch_operating_day: true
      }
    });

    let positions = await prisma.branch_duty_position.findMany({
      where: { branch_id: branch.branch_id, week_start_date: startDate, is_active: true }
    });

    // Every branch+week must have a Manager seat, or anything typed into the
    // MANAGER column has no position_id to save against and is silently lost.
    // Self-heal rather than assume it always exists.
    if (!positions.some(p => p.position_label === "Manager on Duty")) {
      const managerPosition = await prisma.branch_duty_position.upsert({
        where: {
          branch_id_week_start_date_position_label: {
            branch_id: branch.branch_id,
            week_start_date: startDate,
            position_label: "Manager on Duty",
          },
        },
        update: { is_active: true },
        create: {
          branch_id: branch.branch_id,
          week_start_date: startDate,
          position_label: "Manager on Duty",
          position_type: "manager",
          display_order: 0,
          is_active: true,
        },
      });
      positions = [...positions, managerPosition];
    }

    // Which days are actually in scope for this branch — driven by
    // branch_operating_day.is_active, not a static per-branch template.
    const activeOperatingDays = await prisma.branch_operating_day.findMany({
      where: { branch_id: branch.branch_id, is_active: true },
      select: { day_of_week: true },
    });
    const workingDays = activeOperatingDays
      .map(od => ABBREV_TO_DAY[od.day_of_week] || od.day_of_week)
      .filter(Boolean);

    // Build a set of all (date, slot_id, position_id) combos we need to process
    // Then for each combo, either upsert or delete based on the selection value
    await prisma.$transaction(async (tx) => {
      const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

      // Determine which dates are in scope
      const datesToProcess: { dayName: string; date: Date }[] = [];
      for (const dayName of workingDays) {
        const dayIdx = dayOrder.indexOf(dayName);
        if (dayIdx === -1) continue;
        const d = new Date(startDate);
        d.setUTCDate(d.getUTCDate() + dayIdx);
        if (saveDate && d.getTime() !== saveDate.getTime()) continue;
        if (d < startDate || d > endDate) continue;
        datesToProcess.push({ dayName, date: d });
      }

      for (const { dayName, date } of datesToProcess) {
        const dayAbbrev = DAY_TO_ABBREV[dayName] || dayName.slice(0, 3);

        // Get the slots for this day
        const daySlots = slots.filter(s =>
          s.branch_operating_day.day_of_week === dayAbbrev
        );

        for (const slot of daySlots) {
          // Skip opening/closing banner rows — they don't produce per-position assignments
          if (slot.slot_type === "opening" || slot.slot_type === "closing") continue;

          const slotText = formatSlotTime(slot.slot_start, slot.slot_end);

          for (const pos of positions) {
            const colId = normalizePositionToColId(pos.position_label);
            const selectionKey = `${dayName}-${slotText}-${colId}`;
            const selectedName = selections[selectionKey];

            const isNone = !selectedName || selectedName === "None" || selectedName === "" || selectedName === "-- Select --" || selectedName === "Select staff";

            if (isNone) {
              // Delete row if one exists for this combo
              await tx.manpower_schedule.deleteMany({
                where: {
                  date: date,
                  slot_id: slot.slot_id,
                  position_id: pos.position_id,
                  schedule_type: scheduleType,
                }
              });
            } else {
              // Find user_profile by name
              const profile = await tx.user_profile.findFirst({
                where: {
                  OR: [
                    { full_name: { mode: "insensitive", equals: selectedName.trim() } },
                    { nick_name: { mode: "insensitive", equals: selectedName.trim() } },
                  ]
                },
                select: { profile_id: true }
              });
              if (!profile) continue;

              // Upsert: check if row exists, then update or create
              const existing = await tx.manpower_schedule.findFirst({
                where: {
                  date: date,
                  slot_id: slot.slot_id,
                  position_id: pos.position_id,
                  schedule_type: scheduleType,
                }
              });

              if (existing) {
                await tx.manpower_schedule.update({
                  where: { mp_schedule_id: existing.mp_schedule_id },
                  data: {
                    profile_id: profile.profile_id,
                    updated_at: new Date(),
                  },
                });
              } else {
                await tx.manpower_schedule.create({
                  data: {
                    date: date,
                    slot_id: slot.slot_id,
                    position_id: pos.position_id,
                    profile_id: profile.profile_id,
                    schedule_type: scheduleType,
                    updated_at: new Date(),
                  },
                });
              }
            }
          }
        }
      }

      // Upsert period status — planning is never archived, so its status is never tracked
      if (scheduleType === "actual") {
        const existingStatus = await tx.schedule_period_status.findUnique({
          where: {
            branch_id_period_start_period_end: {
              branch_id: branch.branch_id,
              period_start: startDate,
              period_end: endDate,
            }
          }
        });
        if (!existingStatus) {
          await tx.schedule_period_status.create({
            data: {
              branch_id: branch.branch_id,
              period_start: startDate,
              period_end: endDate,
              status: "draft",
            }
          });
        } else if (existingStatus.status !== "archived") {
          await tx.schedule_period_status.update({
            where: { schedule_period_status_id: existingStatus.schedule_period_status_id },
            data: { status: "draft" }
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      schedule: {
        id: `${branchName}_${startDateStr}`,
        branch: branchName,
        startDate: startDateStr,
        endDate: endDateStr,
        selections,
        notes: {},
        status: "Updated",
        submittedAt: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error("[POST /api/schedules]", err);
    return NextResponse.json(
      { success: false, error: "Failed to save schedule" },
      { status: 500 },
    );
  }
}

// "Clear Day" for the Actual schedule: deletes all 'actual' rows for one date
// so the day resets to re-clone fresh from Planning next time it's opened.
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const branchName = raw.branch as string;
    const dateStr = raw.date as string;
    const scheduleType = (raw.scheduleType ?? "actual") as "planning" | "actual";

    if (!branchName || !dateStr) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }
    if (scheduleType !== "actual") {
      return NextResponse.json({ success: false, error: "Clear Day only applies to the Actual schedule" }, { status: 400 });
    }

    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    const date = new Date(`${dateStr}T00:00:00Z`);

    await prisma.manpower_schedule.deleteMany({
      where: {
        date,
        schedule_type: "actual",
        slot: { branch_operating_day: { branch_id: branch.branch_id } },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/schedules]", err);
    return NextResponse.json(
      { success: false, error: "Failed to clear day" },
      { status: 500 },
    );
  }
}
