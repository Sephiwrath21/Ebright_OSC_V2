import { NextResponse } from "next/server";
import { syncAttendance } from "@/lib/sync-attendance";

// Rebuild/refresh attendance_all from the hikvision scan log.
// Trigger manually or from a scheduler (e.g. nightly cron):
//   curl -X POST https://<host>/api/attendance/sync
//   curl -X POST https://<host>/api/attendance/sync -d '{"since":"2026-07-01"}'
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let since: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.since === "string") since = body.since;
    } catch {
      // no/invalid body → full rebuild
    }
    const result = await syncAttendance({ since });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[attendance/sync] failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
