import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isCrmAvailable } from "@/lib/crm-db";
import { getTrialSchedule, type SchedulePreset } from "@/lib/crm-trial-schedule";

export const dynamic = "force-dynamic";

const PRESETS: SchedulePreset[] = [
  "today", "yesterday", "this_week", "last_week", "next_week", "this_month", "custom",
];

// GET /api/crm/dashboard/trial-schedule — superadmin trial-class grid (read-only,
// sourced from ebright_crm). Mirrors v1's endpoint; branch mapping is by branchId.
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
    return NextResponse.json(
      { error: "CRM database not configured (CRM_DATABASE_URL unset)" },
      { status: 503 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const presetParam = sp.get("preset") ?? "this_week";
  const preset = (PRESETS.includes(presetParam as SchedulePreset) ? presetParam : "this_week") as SchedulePreset;

  try {
    const data = await getTrialSchedule({
      branchId: sp.get("branchId") ?? undefined,
      preset,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    });
    if (!data) {
      return NextResponse.json({ error: "CRM data unavailable" }, { status: 503 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    console.error("[GET /api/crm/dashboard/trial-schedule]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
