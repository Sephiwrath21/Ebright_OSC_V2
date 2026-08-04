import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getLeadsMetrics, type Preset } from "@/lib/crm-leads-metrics";

export const dynamic = "force-dynamic";

const PRESETS: Preset[] = [
  "today", "yesterday", "this_week", "next_week", "last_week", "30d", "custom",
];

// GET /api/crm/leads-metrics — superadmin CNS leads dashboard (read-only,
// sourced from ebright_crm). Numbers tally with the live v1 CNS dashboard.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Superadmin only — this is the elevated all-branches view.
  const me = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { role: { select: { role_type: true } } },
  });
  if (me?.role?.role_type !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isCrmAvailable()) {
    return NextResponse.json(
      { error: "CRM database not configured (CRM_DATABASE_URL unset)" },
      { status: 503 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const presetParam = sp.get("preset") ?? "this_week";
  const preset = (PRESETS.includes(presetParam as Preset) ? presetParam : "this_week") as Preset;

  try {
    const data = await getLeadsMetrics({
      preset,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      trend: sp.get("trend") === "1",
    });
    if (!data) {
      return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/leads-metrics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
