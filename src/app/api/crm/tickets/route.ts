import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getTickets } from "@/lib/crm-tickets";
import { buildAccess } from "@/lib/access/engine";
import { resolveTktBranchIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

// GET /api/crm/tickets — ticket list (read-only, from ebright_crm tkt_*), scoped
// to the caller's `cns_ticket_my` grant (branch/region confined to theirs).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_ticket_my", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const branchScope = await resolveTktBranchIds(access, "cns_ticket_my");
  if (!isCrmAvailable()) return NextResponse.json({ error: "CRM database not configured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  try {
    const data = await getTickets({
      status: sp.get("status") ?? undefined,
      platformId: sp.get("platformId") ?? undefined,
      branchId: sp.get("branchId") ?? undefined,
      search: sp.get("search") ?? undefined,
      page: sp.get("page") ? parseInt(sp.get("page")!, 10) : undefined,
      pageSize: sp.get("pageSize") ? parseInt(sp.get("pageSize")!, 10) : undefined,
      allowedBranchIds: branchScope.all ? null : branchScope.ids,
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/tickets]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
