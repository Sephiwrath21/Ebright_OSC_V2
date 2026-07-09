import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getSpaceTasks,
  operationalDay,
  scheduleSection,
  sectionSortKey,
  sortByDueDate,
  statusColor,
  filterToCurrentCycle,
  currentWeekStart,
} from "@/lib/clickup";

export const dynamic = "force-dynamic";

/**
 * Drill-down: tasks in a branch space for a section + (optional) status.
 * scope="overall" matches the operations view (folder weekday, incl. subtasks);
 * scope="daily" (default) matches branch detail (Weekly & Daily day list, top-level).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!token || !teamId) return NextResponse.json({ configured: false });

  const section = req.nextUrl.searchParams.get("section");
  const statusParam = req.nextUrl.searchParams.get("status");
  const overall = req.nextUrl.searchParams.get("scope") === "overall";

  try {
    const raw = await getSpaceTasks(teamId, spaceId, token, { subtasks: true });
    const all = filterToCurrentCycle(raw, currentWeekStart());
    const filtered = all.filter((t) => {
      let sectionMatch: boolean;
      if (!section) {
        sectionMatch = true;
      } else if (overall) {
        const label = scheduleSection(t.folderName);
        const key = sectionSortKey(label)[0] === 3 ? "Other" : label;
        sectionMatch = key === section;
      } else {
        sectionMatch = operationalDay(t.folderName, t.listName) === section;
      }
      const statusMatch = !statusParam || (t.status || "no status") === statusParam;
      return sectionMatch && statusMatch;
    });

    const tasks = sortByDueDate(filtered).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      statusColor: statusColor(t.status, t.statusColor),
      dueDate: t.dueDate,
      listName: t.listName,
      url: t.url,
    }));

    return NextResponse.json({ tasks });
  } catch {
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 502 });
  }
}
