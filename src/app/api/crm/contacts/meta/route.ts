import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isCrmAvailable } from "@/lib/crm-db";
import { getContactsMeta } from "@/lib/crm-contacts";
import { buildAccess } from "@/lib/access/engine";

export const dynamic = "force-dynamic";

// GET /api/crm/contacts/meta — reference data for the contacts filter dropdowns
// (stages, lead sources, assigned users). Read-only; requires `cns_contacts`
// view. Reference lists are tenant-wide (not branch-sensitive).
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_contacts", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isCrmAvailable()) {
    return NextResponse.json({ error: "CRM database not configured (CRM_DATABASE_URL unset)" }, { status: 503 });
  }

  try {
    const meta = await getContactsMeta();
    if (!meta) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(meta);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/contacts/meta]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
