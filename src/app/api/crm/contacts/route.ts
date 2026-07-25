import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getContacts } from "@/lib/crm-contacts";

export const dynamic = "force-dynamic";

// GET /api/crm/contacts — superadmin contacts list (read-only, sourced from
// ebright_crm). Mirrors v1's getContactsByTenant; tallies with the live list.
export async function GET(req: NextRequest) {
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
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/contacts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
