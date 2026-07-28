import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getBranchWeek } from "@/lib/clickup-api";

export const dynamic = "force-dynamic";

// Branch-wide ClickUp totals (sum of all departments' weeks). Runs server-side
// so the ClickUp token stays secret; the client BranchDashboard fetches this.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ week: { done: 0, pending: 0, total: 0 } }, { status: 401 });
  }
  const week = await getBranchWeek();
  return NextResponse.json({ week });
}
