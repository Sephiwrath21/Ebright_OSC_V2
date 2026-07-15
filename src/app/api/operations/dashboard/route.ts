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

  // Authorize only operations@ebright.my or superadmin
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { email: true, role: { select: { role_type: true } } },
  });

  const isSuper = me?.role?.role_type === "superadmin";
  const isOperations = me?.email?.toLowerCase() === "operations@ebright.my";

  if (!me || (!isSuper && !isOperations)) {
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

    // 2. Query CRM leads from ebrightleads_db
    let leads: any[] = [];
    try {
      const res = await queryLeadsDb(`
        SELECT id, full_name, phone_number, email, branch, submitted_at_my
        FROM clean_leads_view
        ORDER BY submitted_at_my DESC
        LIMIT 5;
      `);
      if (res?.rows) {
        leads = res.rows;
      }
    } catch (err) {
      console.error("Failed to query CRM leads in Operations API:", err);
    }

    return NextResponse.json({
      success: true,
      attendance: {
        onboarding,
        offboarding,
        mc: mcCount,
        al: alCount,
      },
      leads,
    });
  } catch (error) {
    console.error("Operations Dashboard API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
