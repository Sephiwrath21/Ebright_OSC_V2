import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getRegionDayDistribution } from "@/lib/crm-region";

export const dynamic = "force-dynamic";

// GET /api/crm/region/day-distribution — superadmin Day Distribution (read-only,
// from ebright_crm). CT/ENR per branch × preferred trial day. Tallies with v1.
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
    const data = await getRegionDayDistribution({
      preset: sp.get("preset") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      region: sp.get("region") ?? undefined,
      branchId: sp.get("branchId") ?? undefined,
    });
    if (!data) return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/region/day-distribution]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
