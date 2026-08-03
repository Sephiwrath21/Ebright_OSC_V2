import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getContacts } from "@/lib/crm-contacts";
import { buildAccess } from "@/lib/access/engine";
import { resolveCrmBranchIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

// GET /api/crm/contacts — CNS contacts list (read-only, sourced from
// ebright_crm). Scope follows the caller's `cns_contacts` grant: branch/region
// callers see only contacts with an opportunity in their branch(es).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_contacts", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const branchScope = await resolveCrmBranchIds(access, "cns_contacts");

  if (!isCrmAvailable()) {
    return NextResponse.json({ error: "CRM database not configured (CRM_DATABASE_URL unset)" }, { status: 503 });
  }

  const sp = req.nextUrl.searchParams;
  const sortByParam = sp.get("sortBy");
  const sortBy = sortByParam === "name" ? "name" : "createdAt";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";

  try {
    const data = await getContacts({
      search: sp.get("search") ?? undefined,
      stageName: sp.get("stageName") ?? undefined,
      leadSourceId: sp.get("leadSourceId") ?? undefined,
      assignedUserId: sp.get("assignedUserId") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
      sortBy,
      sortDir,
      allowedBranchIds: branchScope.all ? null : branchScope.ids,
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/contacts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
