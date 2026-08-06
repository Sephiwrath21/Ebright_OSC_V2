import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getKanban } from "@/lib/crm-opportunities";
import { buildAccess } from "@/lib/access/engine";
import { resolveCrmBranchIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

// GET /api/crm/opportunities — CNS kanban (read-only, from ebright_crm). Scope
// follows the caller's `cns_opportunities` grant: global sees all branches,
// region/branch confined to theirs. scope = 'all' | <branchId> (client picker,
// clamped to the allowed set).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_opportunities", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const branchScope = await resolveCrmBranchIds(access, "cns_opportunities");

  if (!isCrmAvailable()) {
    return NextResponse.json({ error: "CRM database not configured (CRM_DATABASE_URL unset)" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  try {
    const data = await getKanban({
      scope: sp.get("scope") ?? undefined,
      search: sp.get("search") ?? undefined,
      allowedBranchIds: branchScope.all ? null : branchScope.ids,
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/opportunities]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
