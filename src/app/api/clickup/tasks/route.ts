import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveDepartmentId } from "@/app/attendance/leave/approval-queries";
import { resolveTaskScope } from "@/lib/clickup-access";
import {
  getOpenTasks,
  matchOwnerToRoster,
  sortByDueDate,
  aggregateByStatus,
  type ClickUpTaskView,
  type IndividualTasks,
  type OtherBucket,
} from "@/lib/clickup";
import { getEmployeeRoster, getDepartmentName } from "@/lib/clickup-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const user = session?.user as
    | { id?: string; email?: string; name?: string; role?: string; position?: string }
    | undefined;
  if (!user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) {
    return NextResponse.json({ configured: false });
  }

  const viewerUserId = Number(user.id);
  const departmentId = await getActiveDepartmentId(viewerUserId);
  const scope = resolveTaskScope({
    role: user.role,
    position: user.position,
    departmentId,
  });

  try {
    const [roster, tasks] = await Promise.all([getEmployeeRoster(), getOpenTasks(teamId, token)]);

    // Attribute each task to an employee (or null) via its extracted owner name.
    const tasksByUser = new Map<number, ClickUpTaskView[]>();
    const unmatchedByOwner = new Map<string, ClickUpTaskView[]>();
    for (const task of tasks) {
      const ownerUserId = matchOwnerToRoster(task.ownerName, roster);
      if (ownerUserId !== null) {
        const list = tasksByUser.get(ownerUserId) ?? [];
        list.push(task);
        tasksByUser.set(ownerUserId, list);
      } else {
        const key = task.ownerName ?? "Unassigned";
        const list = unmatchedByOwner.get(key) ?? [];
        list.push(task);
        unmatchedByOwner.set(key, list);
      }
    }

    let individuals: IndividualTasks[];
    let other: OtherBucket[] = [];
    let departmentName: string;

    if (scope.kind === "department") {
      departmentName = await getDepartmentName(scope.departmentId);
      const members = roster.filter((r) => r.departmentId === scope.departmentId);
      individuals = members
        .map((m) => ({
          userId: m.userId,
          name: m.fullName || `User ${m.userId}`,
          tasks: sortByDueDate(tasksByUser.get(m.userId) ?? []),
        }))
        .sort((a, b) => {
          if (a.userId === viewerUserId) return -1;
          if (b.userId === viewerUserId) return 1;
          return a.name.localeCompare(b.name);
        });
      other = [...unmatchedByOwner.entries()]
        .map(([ownerName, t]) => ({ ownerName, tasks: sortByDueDate(t) }))
        .sort((a, b) => b.tasks.length - a.tasks.length);
    } else {
      departmentName = "My Tasks";
      individuals = [
        {
          userId: viewerUserId,
          name: user.name ?? user.email,
          tasks: sortByDueDate(tasksByUser.get(viewerUserId) ?? []),
        },
      ];
    }

    return NextResponse.json({
      configured: true,
      scope: scope.kind,
      viewerUserId,
      departmentName,
      individuals,
      other,
      // Status distribution across ALL open workspace tasks (for the pie chart),
      // independent of the per-viewer scoping above.
      statusBreakdown: aggregateByStatus(tasks),
      totalTaskCount: tasks.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load ClickUp tasks" }, { status: 502 });
  }
}
