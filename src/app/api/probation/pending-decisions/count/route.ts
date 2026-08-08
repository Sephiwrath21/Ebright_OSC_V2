import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { listEmployeeOverviewRows } from "@/lib/employeeQueries";
import { lookupCareerApplicationsByName, matchIsProbationPipeline, normalizeName } from "@/lib/careerApplicationSync";
import { computeProbationReminderCandidates } from "@/lib/probationDecision";

export const dynamic = "force-dynamic";

// Feeds the NotificationBell's Probation card — same
// computeProbationReminderCandidates rule the red dot on the Probation
// summary card uses (see employee-folder/page.tsx), just exposed as a count
// for the bell. HR/Superadmin only, same restriction as the
// decideProbationOutcome action this reminder points HR toward.
export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role?.toLowerCase();
  if (!session || (role !== "hr" && role !== "superadmin")) {
    return NextResponse.json({ count: 0 });
  }

  const [rows, careerApplications] = await Promise.all([
    listEmployeeOverviewRows({ skipScopeFilter: true }),
    lookupCareerApplicationsByName(),
  ]);
  const probationBadgedRows = rows.filter(
    (r) => r.stage === "probation" || matchIsProbationPipeline(careerApplications.get(normalizeName(r.fullName))),
  );
  const candidates = await computeProbationReminderCandidates(probationBadgedRows, careerApplications);
  return NextResponse.json({ count: candidates.length });
}
