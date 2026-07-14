import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateManpowerCost } from "@/lib/manpowerCost";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const branchName = raw.branch as string;
    const startDateStr = raw.startDate as string;
    const endDateStr = raw.endDate as string;

    if (!branchName || !startDateStr || !endDateStr) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const branch = await prisma.branch.findFirst({
      where: { branch_name: branchName },
      select: { branch_id: true }
    });

    if (!branch) {
      return NextResponse.json({ success: false, error: "Unknown branch" }, { status: 400 });
    }

    // 1. Calculate costs using our service
    const costRecords = await calculateManpowerCost(branch.branch_id, startDateStr, endDateStr);

    const periodStart = new Date(`${startDateStr}T00:00:00Z`);
    const periodEnd = new Date(`${endDateStr}T00:00:00Z`);

    // 2. Perform all database updates within a transaction
    await prisma.$transaction(async (tx) => {
      // Upsert each cost record
      for (const record of costRecords) {
        await tx.manpower_cost_report.upsert({
          where: {
            user_id_date: {
              user_id: record.user_id,
              date: record.date
            }
          },
          update: {
            coach_hrs: record.coach_hrs,
            exec_hrs: record.exec_hrs,
            training_hrs: record.training_hrs,
            star_coach_hrs: record.star_coach_hrs,
            coach_rate: record.coach_rate,
            exec_rate: record.exec_rate,
            training_rate: record.training_rate,
            star_coach_rate: record.star_coach_rate,
            total_pay: record.total_pay,
            calculated_at: new Date()
          },
          create: {
            user_id: record.user_id,
            date: record.date,
            coach_hrs: record.coach_hrs,
            exec_hrs: record.exec_hrs,
            training_hrs: record.training_hrs,
            star_coach_hrs: record.star_coach_hrs,
            coach_rate: record.coach_rate,
            exec_rate: record.exec_rate,
            training_rate: record.training_rate,
            star_coach_rate: record.star_coach_rate,
            total_pay: record.total_pay,
            calculated_at: new Date()
          }
        });
      }

      // 3. Mark the period as archived
      await tx.schedule_period_status.upsert({
        where: {
          branch_id_period_start_period_end: {
            branch_id: branch.branch_id,
            period_start: periodStart,
            period_end: periodEnd
          }
        },
        update: {
          status: "archived",
          archived_at: new Date()
        },
        create: {
          branch_id: branch.branch_id,
          period_start: periodStart,
          period_end: periodEnd,
          status: "archived",
          archived_at: new Date()
        }
      });
    });

    return NextResponse.json({ success: true, recordsProcessed: costRecords.length });
  } catch (err: any) {
    console.error("[POST /api/schedules/archive]", err);
    return NextResponse.json({ success: false, error: err?.message || "Failed to archive schedule" }, { status: 500 });
  }
}
