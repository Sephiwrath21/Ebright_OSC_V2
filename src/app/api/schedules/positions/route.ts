import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Position type config ───
const POSITION_TYPES: Record<string, { dbType: string; labelPrefix: string; baseOrder: number }> = {
  coach:    { dbType: "coach",      labelPrefix: "Coach",      baseOrder: 100 },
  exec:     { dbType: "exec",       labelPrefix: "Exec",       baseOrder: 200 },
  training: { dbType: "coach",      labelPrefix: "Training",   baseOrder: 300 },
  star:     { dbType: "coach",      labelPrefix: "Star Coach",  baseOrder: 400 },
};

// ─── GET: Return active positions for a branch ───
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

  const weekStartDate = new Date(`${weekStartDateStr}T00:00:00Z`);

  try {
    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    let positions = await prisma.branch_duty_position.findMany({
      where: { branch_id: branch.branch_id, week_start_date: weekStartDate },
      orderBy: { display_order: "asc" },
    });

    // If no positions exist for this week, we need to clone from a previous week or seed defaults
    if (positions.length === 0) {
      // Find the most recent week that has positions
      const previousPositions = await prisma.branch_duty_position.findMany({
        where: { branch_id: branch.branch_id, week_start_date: { lt: weekStartDate } },
        orderBy: { week_start_date: "desc" },
      });

      const positionsToCreate = [];

      if (previousPositions.length > 0) {
        // Clone from the most recent week
        const mostRecentWeekDate = previousPositions[0].week_start_date;
        const configToClone = previousPositions.filter(p => p.week_start_date.getTime() === mostRecentWeekDate.getTime());
        
        for (const p of configToClone) {
          positionsToCreate.push({
            branch_id: branch.branch_id,
            week_start_date: weekStartDate,
            position_label: p.position_label,
            position_type: p.position_type,
            display_order: p.display_order,
            is_active: p.is_active,
          });
        }
      } else {
        // Seed default configuration (1 Mgr, 3 Coach, 3 Exec, 0 Train, 0 Star)
        positionsToCreate.push({
          branch_id: branch.branch_id,
          week_start_date: weekStartDate,
          position_label: "Manager on Duty",
          position_type: "manager",
          display_order: 0,
          is_active: true,
        });

        for (let i = 1; i <= 3; i++) {
          positionsToCreate.push({
            branch_id: branch.branch_id, week_start_date: weekStartDate,
            position_label: `Coach ${i}`, position_type: "coach", display_order: 100 + i, is_active: true,
          });
          positionsToCreate.push({
            branch_id: branch.branch_id, week_start_date: weekStartDate,
            position_label: `Exec ${i}`, position_type: "exec", display_order: 200 + i, is_active: true,
          });
        }
      }

      await prisma.branch_duty_position.createMany({ data: positionsToCreate });

      // Fetch them again after creating
      positions = await prisma.branch_duty_position.findMany({
        where: { branch_id: branch.branch_id, week_start_date: weekStartDate },
        orderBy: { display_order: "asc" },
      });
    }

    // Every branch+week must have a Manager seat — self-heal branches/weeks
    // whose position rows predate this guarantee or were cloned from a week
    // that was itself missing one, otherwise MANAGER-column assignments have
    // no position_id to save against and are silently lost.
    if (!positions.some(p => p.position_label === "Manager on Duty")) {
      await prisma.branch_duty_position.upsert({
        where: {
          branch_id_week_start_date_position_label: {
            branch_id: branch.branch_id,
            week_start_date: weekStartDate,
            position_label: "Manager on Duty",
          },
        },
        update: { is_active: true },
        create: {
          branch_id: branch.branch_id,
          week_start_date: weekStartDate,
          position_label: "Manager on Duty",
          position_type: "manager",
          display_order: 0,
          is_active: true,
        },
      });
      positions = await prisma.branch_duty_position.findMany({
        where: { branch_id: branch.branch_id, week_start_date: weekStartDate },
        orderBy: { display_order: "asc" },
      });
    }

    // Count active positions per type
    const counts: Record<string, number> = { coach: 0, exec: 0, training: 0, star: 0 };
    for (const pos of positions) {
      if (!pos.is_active) continue;
      if (pos.position_label.startsWith("Coach")) counts.coach++;
      else if (pos.position_type === "exec") counts.exec++;
      else if (pos.position_label.startsWith("Training")) counts.training++;
      else if (pos.position_label.startsWith("Star Coach")) counts.star++;
    }

    return NextResponse.json({
      success: true,
      counts,
      positions: positions
        .filter(p => p.is_active)
        .map(p => ({
          position_id: p.position_id,
          label: p.position_label,
          type: p.position_type,
          display_order: p.display_order,
        })),
    });
  } catch (err) {
    console.error("[GET /api/schedules/positions]", err);
    return NextResponse.json({ success: false, error: "Failed to fetch positions" }, { status: 500 });
  }
}

// ─── POST: Manage seat counts ───
// Body: { branch: string, weekStartDate: string, counts: { coach: 3, exec: 3, training: 0, star: 0 } }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const branchName = raw.branch as string;
    const weekStartDateStr = raw.weekStartDate as string;
    const counts = raw.counts as Record<string, number>;

    if (!branchName || !weekStartDateStr || !counts) {
      return NextResponse.json({ success: false, error: "Missing branch, weekStartDate, or counts" }, { status: 400 });
    }

    const weekStartDate = new Date(`${weekStartDateStr}T00:00:00Z`);

    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    // Process each position type
    for (const [typeKey, desiredCount] of Object.entries(counts)) {
      const config = POSITION_TYPES[typeKey];
      if (!config) continue;

      // Get ALL positions (active + inactive) of this type for this branch+week, ordered by label number
      const allPositions = await prisma.branch_duty_position.findMany({
        where: {
          branch_id: branch.branch_id,
          week_start_date: weekStartDate,
          position_label: { startsWith: config.labelPrefix },
        },
        orderBy: { display_order: "asc" },
      });

      const activeCount = allPositions.filter(p => p.is_active).length;

      if (desiredCount > activeCount) {
        // Need more seats — first reactivate, then create
        const inactiveOnes = allPositions.filter(p => !p.is_active).sort((a, b) => a.display_order - b.display_order);
        let toActivate = desiredCount - activeCount;

        // Reactivate existing inactive ones first
        for (const pos of inactiveOnes) {
          if (toActivate <= 0) break;
          await prisma.branch_duty_position.update({
            where: { position_id: pos.position_id },
            data: { is_active: true },
          });
          toActivate--;
        }

        // If still need more, create new ones
        if (toActivate > 0) {
          // Find highest existing number for this prefix
          let maxNum = 0;
          for (const pos of allPositions) {
            const m = pos.position_label.match(/(\d+)$/);
            if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
          }

          for (let i = 0; i < toActivate; i++) {
            maxNum++;
            await prisma.branch_duty_position.create({
              data: {
                branch_id: branch.branch_id,
                week_start_date: weekStartDate,
                position_label: `${config.labelPrefix} ${maxNum}`,
                position_type: config.dbType,
                display_order: config.baseOrder + maxNum,
                is_active: true,
              },
            });
          }
        }
      } else if (desiredCount < activeCount) {
        // Need fewer seats — deactivate highest-numbered active ones
        const activeOnes = allPositions.filter(p => p.is_active).sort((a, b) => b.display_order - a.display_order);
        let toDeactivate = activeCount - desiredCount;

        for (const pos of activeOnes) {
          if (toDeactivate <= 0) break;
          await prisma.branch_duty_position.update({
            where: { position_id: pos.position_id },
            data: { is_active: false },
          });
          toDeactivate--;
        }
      }
      // If desiredCount === activeCount, nothing to do
    }

    // Return the updated state
    const updatedPositions = await prisma.branch_duty_position.findMany({
      where: { branch_id: branch.branch_id, week_start_date: weekStartDate, is_active: true },
      orderBy: { display_order: "asc" },
    });

    const updatedCounts: Record<string, number> = { coach: 0, exec: 0, training: 0, star: 0 };
    for (const pos of updatedPositions) {
      if (pos.position_label.startsWith("Coach")) updatedCounts.coach++;
      else if (pos.position_type === "exec") updatedCounts.exec++;
      else if (pos.position_label.startsWith("Training")) updatedCounts.training++;
      else if (pos.position_label.startsWith("Star Coach")) updatedCounts.star++;
    }

    return NextResponse.json({
      success: true,
      counts: updatedCounts,
      positions: updatedPositions.map(p => ({
        position_id: p.position_id,
        label: p.position_label,
        type: p.position_type,
        display_order: p.display_order,
      })),
    });
  } catch (err) {
    console.error("[POST /api/schedules/positions]", err);
    return NextResponse.json({ success: false, error: "Failed to update positions" }, { status: 500 });
  }
}
