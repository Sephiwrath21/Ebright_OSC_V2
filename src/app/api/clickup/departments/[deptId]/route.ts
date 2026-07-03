import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  aggregateByStatus,
  currentWeekStart,
  filterToCurrentCycle,
  matchOwnerToRoster,
  operationalDay,
  sectionSortKey,
  type ClickUpTaskView,
} from "@/lib/clickup";

export const dynamic = "force-dynamic";

interface Department {
  id: string;
  code: string;
  name: string;
}

type Payload =
  | { configured: false }
  | {
      configured: true;
      department: Department;
      totalTaskCount: number;
      sections: Section[];
    };

interface Section {
  name: string;
  total: number;
  statusBreakdown: { status: string; color: string; count: number }[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deptId: string }> },
) {
  const { deptId } = await params;
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "superadmin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) return NextResponse.json({ configured: false });

  try {
    // Get department
    const dept = await prisma.department.findUnique({
      where: { department_id: parseInt(deptId) },
      select: {
        department_id: true,
        department_code: true,
        department_name: true,
      },
    });

    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    // Get all active employees in the department
    const employees = await prisma.users.findMany({
      where: {
        status: "active",
        employment: {
          some: {
            status: "active",
            department_id: parseInt(deptId),
          },
        },
      },
      select: {
        user_id: true,
        user_profile: {
          select: {
            full_name: true,
            nick_name: true,
          },
        },
      },
    });

    // For now, return a structure similar to branch dashboard
    // In the future, we can fetch actual ClickUp tasks and filter by department members
    const sections: Section[] = employees.map((emp) => ({
      name: emp.user_profile?.full_name || `Employee ${emp.user_id}`,
      total: 0, // Placeholder - would need to fetch actual tasks
      statusBreakdown: [],
    }));

    return NextResponse.json({
      configured: true,
      department: {
        id: dept.department_id.toString(),
        code: dept.department_code,
        name: dept.department_name,
      },
      totalTaskCount: 0,
      sections,
    } as Extract<Payload, { configured: true }>);
  } catch (error) {
    console.error("Failed to load department dashboard:", error);
    return NextResponse.json(
      { error: "Failed to load department dashboard" },
      { status: 502 },
    );
  }
}
