import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getKanban } from "@/lib/crm-opportunities";

export const dynamic = "force-dynamic";

// GET /api/crm/opportunities — superadmin kanban (read-only, from ebright_crm).
// scope = 'all' | <branchId>. Per-stage counts tally with v1; cards are capped.
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
  try {
    const data = await getKanban({
      scope: sp.get("scope") ?? undefined,
      search: sp.get("search") ?? undefined,
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/opportunities]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
