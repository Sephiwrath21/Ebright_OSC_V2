import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 });
  }

  try {
    const branches = await prisma.branch.findMany({
      include: {
        employment: {
          where: {
            status: "active",
          },
          select: {
            employment_id: true,
          },
        },
      },
      orderBy: { branch_name: "asc" },
    });

    const mappedBranches = branches.map((b) => ({
      branch_id:   b.branch_id,
      branch_name: b.branch_name,
      location:    b.location,
      branch_code: b.branch_code,
      region:      b.region,
      staff_count: b.employment.length,
    }));

    return NextResponse.json({ success: true, branches: mappedBranches });
  } catch (err) {
    console.error("[GET /api/branches]", err);
    return NextResponse.json({ success: false, error: "Failed to list branches" }, { status: 500 });
  }
}
