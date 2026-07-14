import { prisma } from "@/lib/prisma";
import type { RosterEntry } from "@/lib/clickup";

/**
 * All active employees, with the fields needed to match an extracted ClickUp
 * owner nickname (full_name / nick_name) and to scope by department.
 */
export async function getEmployeeRoster(): Promise<RosterEntry[]> {
  const rows = await prisma.users.findMany({
    where: { status: "active" },
    select: {
      user_id: true,
      user_profile: { select: { full_name: true, nick_name: true } },
      employment: {
        where: { status: "active" },
        take: 1,
        select: { department_id: true },
      },
    },
  });
  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.user_profile?.full_name ?? "",
    nickName: r.user_profile?.nick_name ?? null,
    departmentId: r.employment[0]?.department_id ?? null,
  }));
}

/** Department name for display. */
export async function getDepartmentName(departmentId: number): Promise<string> {
  const dept = await prisma.department.findUnique({
    where: { department_id: departmentId },
    select: { department_name: true },
  });
  return dept?.department_name ?? "Department";
}
