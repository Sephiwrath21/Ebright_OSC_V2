import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getTicketKanban, type TicketKanbanRange } from "@/lib/crm-tickets";
import { buildAccess } from "@/lib/access/engine";
import { resolveTktBranchIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

const VALID_RANGES: TicketKanbanRange[] = ["today", "yesterday", "last7", "month", "custom", "all"];

// GET /api/crm/tickets/kanban — ticket status board (read-only), scoped to the
// caller's `cns_ticket_opportunities` grant. Optional query params:
// range=today|yesterday|last7|month|custom|all, and for custom: from & to.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_ticket_opportunities", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const branchScope = await resolveTktBranchIds(access, "cns_ticket_opportunities");
  if (!isCrmAvailable()) return NextResponse.json({ error: "CRM database not configured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const rawRange = sp.get("range");
  const range: TicketKanbanRange = VALID_RANGES.includes(rawRange as TicketKanbanRange)
    ? (rawRange as TicketKanbanRange)
    : "all";
  const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = isDate(sp.get("from")) ? sp.get("from") : null;
  const to = isDate(sp.get("to")) ? sp.get("to") : null;

  try {
    const data = await getTicketKanban({
      range, from, to,
      allowedBranchIds: branchScope.all ? null : branchScope.ids,
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/tickets/kanban]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
