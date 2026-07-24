import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getTicketKanban, type TicketKanbanRange } from "@/lib/crm-tickets";

export const dynamic = "force-dynamic";

const VALID_RANGES: TicketKanbanRange[] = ["today", "yesterday", "last7", "month", "custom", "all"];

// GET /api/crm/tickets/kanban — superadmin ticket status board (read-only).
// Optional query params: range=today|yesterday|last7|month|custom|all,
// and for custom: from=YYYY-MM-DD & to=YYYY-MM-DD.
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
  const rawRange = sp.get("range");
  const range: TicketKanbanRange = VALID_RANGES.includes(rawRange as TicketKanbanRange)
    ? (rawRange as TicketKanbanRange)
    : "all";
  const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = isDate(sp.get("from")) ? sp.get("from") : null;
  const to = isDate(sp.get("to")) ? sp.get("to") : null;

  try {
    const data = await getTicketKanban({ range, from, to });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/tickets/kanban]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
