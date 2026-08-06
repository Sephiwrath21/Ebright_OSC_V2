import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EmployeeOverviewView from "@/app/components/EmployeeOverviewView";
import {
  listEmployeeOverviewRows,
  countEmployeeStages,
  getOverdueTaskCounts,
} from "@/lib/employeeQueries";
import {
  lookupCareerApplicationsByName,
  matchIsProbationPipeline,
  matchIsProbationOverrideExcluded,
  normalizeName,
} from "@/lib/careerApplicationSync";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Employee Folder",
};

export default async function EmployeeFolderPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const rows = await listEmployeeOverviewRows();
  const counts = countEmployeeStages(rows);
  // ebrightleads (onboarding_candidate) is no longer merged into Pre —
  // disabled per decision; Pre now only reflects real employment rows
  // (status="pre") plus, going forward, ebright_hrfs/career_applications
  // syncs. See listUpcomingOnboardingCandidates in employeeQueries.ts,
  // still defined but no longer called from here.
  //
  // Probation's card count must match what its own list page shows — that
  // page's membership rule is an OR across career_applications.board_stage
  // and rec_recruit/rec_stage.name (see matchIsProbationPipeline), which can
  // both ADD non-Probation-stage rows and REMOVE real-Probation-stage rows
  // whose manual flag neither pipeline field corroborates anymore
  // (matchIsProbationOverrideExcluded) — see [stage]/page.tsx for the full
  // rationale. Same lookup, same rule, applied here just for the count.
  const careerApplications = await lookupCareerApplicationsByName();
  let probationCount = 0;
  for (const row of rows) {
    const match = careerApplications.get(normalizeName(row.fullName));
    if (row.stage === "probation") {
      if (!matchIsProbationOverrideExcluded(match)) probationCount += 1;
    } else if (matchIsProbationPipeline(match)) {
      probationCount += 1;
    }
  }
  counts.probation = probationCount;
  const overdueTaskCounts = await getOverdueTaskCounts(rows.map((r) => r.id));

  const userEmail = session.user.email;
  const userRole = (session.user as { role?: string }).role ?? "";
  const userName = session.user.name ?? null;

  return (
    <AppShell email={userEmail} role={userRole} name={userName}>
      <EmployeeOverviewView rows={rows} counts={counts} userName={userName} overdueTaskCounts={overdueTaskCounts} />
    </AppShell>
  );
}
