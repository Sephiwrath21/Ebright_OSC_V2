import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getBranches } from "@/lib/crm-branches";

export const dynamic = "force-dynamic";

// GET /api/crm/branches — superadmin branch list (read-only, from HRFS).
// Keyed by branch_id; email resolved from the HRFS role_id=4 branch account.
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

  try {
    const branches = await getBranches();
    if (!branches) return NextResponse.json({ error: "HRFS branch data unavailable" }, { status: 503 });
    return NextResponse.json({ branches });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/branches]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
