import { NextResponse } from "next/server";
import { pcmSessionUser } from "@/lib/pcm/auth";
import { fetchAllReports } from "@/lib/pcm/reports.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await pcmSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const reports = await fetchAllReports();
    return NextResponse.json({ reports });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/pcm/reports] failed:", msg);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
