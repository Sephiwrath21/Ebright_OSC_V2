import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { queryLeadsDb } from "@/lib/leads-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorize only academy@ebright.my or superadmin
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { email: true, role: { select: { role_type: true } } },
  });

  const isSuper = me?.role?.role_type === "superadmin";
  const isAcademy = me?.email?.toLowerCase() === "academy@ebright.my";

  if (!me || (!isSuper && !isAcademy)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Query attendance metrics from DB
    const [onboarding, offboarding, mcCount, alCount] = await Promise.all([
      prisma.induction_profile.count({
        where: {
          induction_type: "Onboarding",
          status: { in: ["Sent", "In Progress", "Created"] },
        },
      }),
      prisma.induction_profile.count({
        where: {
          induction_type: "Offboarding",
          status: { in: ["Sent", "In Progress", "Created"] },
        },
      }),
      prisma.leave_request.count({
        where: {
          status: "approved",
          start_date: { lte: today },
          end_date: { gte: today },
          leave_types: {
            leave_type_code: "MC",
          },
        },
      }),
      prisma.leave_request.count({
        where: {
          status: "approved",
          start_date: { lte: today },
          end_date: { gte: today },
          leave_types: {
            leave_type_code: "AL",
          },
        },
      }),
    ]);

    // 2. Query Student Management System (SMS) students from ebrightleads_db
    let students: any[] = [];
    try {
      const res = await queryLeadsDb(`
        SELECT id, name, branch, grade, active, created_at
        FROM fa_students
        ORDER BY created_at DESC
        LIMIT 5;
      `);
      if (res?.rows) {
        students = res.rows;
      }
    } catch (err) {
      console.error("Failed to query SMS students in Academy API:", err);
    }

    return NextResponse.json({
      success: true,
      attendance: {
        onboarding,
        offboarding,
        mc: mcCount,
        al: alCount,
      },
      students,
    });
  } catch (error) {
    console.error("Academy Dashboard API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
