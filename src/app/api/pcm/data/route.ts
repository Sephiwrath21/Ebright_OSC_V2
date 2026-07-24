import { NextResponse } from "next/server";
import { pcmSessionUser } from "@/lib/pcm/auth";
import { fetchAllEventData } from "@/lib/pcm/events.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PCM bundle: events + sessions + quotas + invitations + overrides (crm schema).
export async function GET() {
  const user = await pcmSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await fetchAllEventData();
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/pcm/data] failed:", msg);
    return NextResponse.json({ error: "Failed to load PCM data" }, { status: 500 });
  }
}
