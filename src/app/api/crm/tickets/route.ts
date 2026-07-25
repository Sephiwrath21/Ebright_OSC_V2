import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getTickets } from "@/lib/crm-tickets";

export const dynamic = "force-dynamic";

// GET /api/crm/tickets — superadmin ticket list (read-only, from ebright_crm tkt_*).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  if (me?.role?.role_type !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/tickets]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
