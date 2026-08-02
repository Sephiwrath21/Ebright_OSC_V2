import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBranches } from "@/lib/crm-branches";
import { buildAccess } from "@/lib/access/engine";

export const dynamic = "force-dynamic";

// GET /api/crm/branches — branch list (read-only, from HRFS). Keyed by branch_id;
// email resolved from the HRFS role_id=4 branch account. Scoped to the caller's
// `cns_branches` grant: region → their region, branch → their own branch only.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await buildAccess(session.user.email);
  if (!access || !access.can("cns_branches", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const constraint = access.constraint("cns_branches", "view");

  try {
    const all = await getBranches();
    if (!all) return NextResponse.json({ error: "HRFS branch data unavailable" }, { status: 503 });
    // Clamp to the caller's scope (branches are keyed by portal branch_id).
    const branches =
      constraint.kind === "global"
        ? all
        : constraint.kind === "region"
          ? all.filter((b) => b.region === access.actor.region)
          : constraint.kind === "branch"
            ? all.filter((b) => b.id === String(access.actor.branchId))
            : [];
    return NextResponse.json({ branches });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/branches]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
