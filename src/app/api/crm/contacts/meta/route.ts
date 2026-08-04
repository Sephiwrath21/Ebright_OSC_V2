import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getContactsMeta } from "@/lib/crm-contacts";

export const dynamic = "force-dynamic";

// GET /api/crm/contacts/meta — reference data for the contacts filter dropdowns
// (stages, lead sources, assigned users). Read-only, superadmin.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  if (me?.role?.role_type !== "superadmin") {
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
