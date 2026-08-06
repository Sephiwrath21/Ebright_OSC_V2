import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getTicketRefData } from "@/lib/crm-tickets";
import { buildAccess } from "@/lib/access/engine";
import { resolveTktBranchIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

// GET /api/crm/tickets/ref-data — New-Ticket dropdown data (read-only). Requires
// `cns_ticket_new` view; the branch picker is confined to the caller's branch(es).
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_ticket_new", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const branchScope = await resolveTktBranchIds(access, "cns_ticket_new");
  if (!isCrmAvailable()) return NextResponse.json({ error: "CRM database not configured" }, { status: 503 });

  try {
    const data = await getTicketRefData();
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    // Restrict the branch picker to what the caller may file tickets for.
    const scoped = branchScope.all
      ? data
      : { ...data, branches: data.branches.filter((b) => branchScope.ids.includes(b.id)) };
    return NextResponse.json(scoped);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/tickets/ref-data]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
