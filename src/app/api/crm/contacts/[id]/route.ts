import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getContactDetail } from "@/lib/crm-contact-detail";
import { buildAccess } from "@/lib/access/engine";
import { resolveCrmBranchIds } from "@/lib/crm-scope";

export const dynamic = "force-dynamic";

// GET /api/crm/contacts/[id] — contact profile (read-only, sourced from
// ebright_crm). Scoped to the caller's `cns_contacts` grant: out-of-branch
// contacts read as 404.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  try {
    const { id } = await params;
    const contact = await getContactDetail(id, branchScope.all ? null : branchScope.ids);
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(contact);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/contacts/[id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
