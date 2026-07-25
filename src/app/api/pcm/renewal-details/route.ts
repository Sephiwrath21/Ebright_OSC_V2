import { NextResponse, type NextRequest } from "next/server";
import { pcmSessionUser } from "@/lib/pcm/auth";
import { fetchRenewalDetails } from "@/lib/pcm/renewals.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await pcmSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  try {
    const result = await fetchRenewalDetails({
      branch: sp.get("branch"),
      start: sp.get("start"),
      end: sp.get("end"),
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/pcm/renewal-details] failed:", msg);
    return NextResponse.json({ error: "Failed to load renewals" }, { status: 500 });
  }
}
