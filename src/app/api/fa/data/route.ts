import { NextResponse } from "next/server";
import { faSessionUser } from "@/lib/fa/auth";
import { fetchAllEventData } from "@/lib/fa/events.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Bundle load for the FA dashboard/events pages: events + sessions + quotas +
// invitations + multi-grade overrides, straight from ebrightleads_db.
export async function GET() {
  const user = await faSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await fetchAllEventData();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/fa/data] failed:", msg);
    return NextResponse.json({ error: "Failed to load FA data" }, { status: 500 });
  }
}
