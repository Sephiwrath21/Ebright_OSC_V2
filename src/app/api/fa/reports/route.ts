import { NextResponse } from "next/server";
import { faSessionUser } from "@/lib/fa/auth";
import { fetchAllFaReports } from "@/lib/fa/reports.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// All filled FA assessment reports (crm.fa_assessment_reports). Read is open to
// any authenticated user, matching v1's GET /api/fa/reports. Writing (score
// entry) is role-gated and handled separately in phase 2.
export async function GET() {
  const user = await faSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const reports = await fetchAllFaReports();
    return NextResponse.json({ reports });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/fa/reports] failed:", msg);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}
