import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getLeadsMetrics, type Preset, type MetricsScope } from "@/lib/crm-leads-metrics";
import { buildAccess } from "@/lib/access/engine";

export const dynamic = "force-dynamic";

const PRESETS: Preset[] = [
  "today", "yesterday", "this_week", "next_week", "last_week", "30d", "custom",
];

// GET /api/crm/leads-metrics — CNS leads dashboard (read-only, sourced from
// ebright_crm). Numbers tally with the live v1 CNS dashboard. Scope follows the
// caller's `cns_dashboard` grant: superadmin/ceo see all branches, regional
// managers their region, branch managers only their own branch.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_dashboard", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Translate the grant's scope into the branches this caller may count over.
  const constraint = access.constraint("cns_dashboard", "view");
  let scope: MetricsScope;
  switch (constraint.kind) {
    case "global":
      scope = { kind: "global" };
      break;
    case "region":
      scope = { kind: "region", region: constraint.region };
      break;
    case "branch": {
      const branch = constraint.branchId
        ? await prisma.branch.findUnique({
            where: { branch_id: constraint.branchId },
            select: { branch_code: true },
          })
        : null;
      scope = { kind: "branch", branchCodes: branch?.branch_code ? [branch.branch_code] : [] };
      break;
    }
    default:
      // department/own/none don't map to a CNS branch view → nothing to show.
      scope = { kind: "branch", branchCodes: [] };
      break;
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
      scope,
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
