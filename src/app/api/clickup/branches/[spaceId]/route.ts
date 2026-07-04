import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getBranchSpaces,
  getSpaceTasks,
  aggregateByStatus,
  operationalDay,
  sectionSortKey,
  filterToCurrentCycle,
  currentWeekStart,
  type ClickUpTaskView,
} from "@/lib/clickup";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) return NextResponse.json({ configured: false });

  try {
    const branches = await getBranchSpaces(teamId, token);
    const branch = branches.find((b) => b.id === spaceId);
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

    // Weekly & Daily tasks incl. subtasks + completed (matches the branch board cards).
    const raw = await getSpaceTasks(teamId, spaceId, token, { subtasks: true });
    const tasks = filterToCurrentCycle(raw, currentWeekStart());

    // Day = the weekday LIST inside the Weekly & Daily folder (e.g. "Thursday").
    const bySection = new Map<string, ClickUpTaskView[]>();
    for (const task of tasks) {
      const day = operationalDay(task.folderName, task.listName);
      if (!day) continue;
      const list = bySection.get(day) ?? [];
      list.push(task);
      bySection.set(day, list);
    }

    const sections = [...bySection.entries()]
      .map(([name, sectionTasks]) => ({
        name,
        total: sectionTasks.length,
        statusBreakdown: aggregateByStatus(sectionTasks),
      }))
      .sort((a, b) => {
        const ra = sectionSortKey(a.name);
        const rb = sectionSortKey(b.name);
        for (let i = 0; i < 3; i++) {
          if (ra[i] < rb[i]) return -1;
          if (ra[i] > rb[i]) return 1;
        }
        return 0;
      });

    return NextResponse.json({
      configured: true,
      branch,
      totalTaskCount: sections.reduce((sum, s) => sum + s.total, 0),
      sections,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load branch dashboard" }, { status: 502 });
  }
}
