import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getTicketDashboard } from "@/lib/crm-tickets";
import { buildAccess } from "@/lib/access/engine";
import { resolveTktBranchIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

// GET /api/crm/tickets/dashboard — ticket dashboard aggregates, scoped to the
// caller's `cns_ticket_dashboard` grant (branch/region confined to theirs).
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_ticket_dashboard", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const branchScope = await resolveTktBranchIds(access, "cns_ticket_dashboard");
  if (!isCrmAvailable()) return NextResponse.json({ error: "CRM database not configured" }, { status: 503 });

  try {
    const data = await getTicketDashboard({
      allowedBranchIds: branchScope.all ? null : branchScope.ids,
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/tickets/dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
