import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Authorize only od@ebright.my or superadmin
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { email: true, role: { select: { role_type: true } } },
  });

  const isSuper = me?.role?.role_type === "superadmin";
  const isOD = me?.email?.toLowerCase() === "od@ebright.my";

  if (!me || (!isSuper && !isOD)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    return NextResponse.json({
      success: true,
      attendance: {
        onboarding,
        offboarding,
        mc: mcCount,
        al: alCount,
      },
    });
  } catch (error) {
    console.error("Failed to load OD dashboard data:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
