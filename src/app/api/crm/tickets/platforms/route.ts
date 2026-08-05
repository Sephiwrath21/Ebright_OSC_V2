import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getPlatforms } from "@/lib/crm-tickets";
import { buildAccess } from "@/lib/access/engine";

export const dynamic = "force-dynamic";

// GET /api/crm/tickets/platforms — ticket platforms with counts. Requires
// `cns_ticket_platforms` view. NOTE: the per-platform counts are tenant-wide
// (not branch-filtered) — platforms are a shared config surface.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_ticket_platforms", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isCrmAvailable()) return NextResponse.json({ error: "CRM database not configured" }, { status: 503 });

  try {
    const platforms = await getPlatforms();
    if (!platforms) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json({ platforms });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/tickets/platforms]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
